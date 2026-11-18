"""Split jobs: plan (read-only) → work (no GitHub token, intents only) → publish (write token, checks).

Run: python3 -m unittest discover -s .autopilot/tests
"""

import argparse
import hashlib
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("autopilot_split", HERE / "autopilot.py")
assert spec and spec.loader
ap: Any = importlib.util.module_from_spec(spec)
sys.modules["autopilot_split"] = ap
spec.loader.exec_module(ap)

SHA = "a" * 40


def git(*args: str) -> str:
    return subprocess.run(["git", *args], cwd=ap.ROOT, capture_output=True, text=True, check=True).stdout.strip()


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp())
        ap.ARGS = argparse.Namespace(dry_run=False, sandbox=False, max_tasks=1, state_dir=self.tmp, result_dir=self.tmp,
                                     plan_sha256=None)
        ap.OUTBOX.clear()
        ap.MERGE_QUEUE.clear()
        ap._DISPATCHED.clear()
        self.saved = (ap.PHASE, ap.gh, ap.gh_json)
        self.gh_calls = []
        ap.gh = lambda *a, **k: self.gh_calls.append(a) or ""

    def tearDown(self):
        ap.PHASE, ap.gh, ap.gh_json = self.saved
        ap.PLAN.clear()


class DeferredWrites(Base):
    def test_work_phase_writes_become_intents_and_call_no_gh(self):
        ap.PHASE = "work"
        ap.issue_comment(5, "hello")
        ap.set_status(5, "in_progress")
        ap.telegram("task_blocked", "x")
        ap.pause("why")
        ap.dispatch_ci("autopilot/5-x")
        self.assertEqual([i["kind"] for i in ap.OUTBOX], ["comment", "status", "telegram", "pause", "dispatch_ci"])
        self.assertEqual(self.gh_calls, [])

    def test_all_phase_still_writes_directly(self):
        ap.PHASE = "all"
        ap.issue_comment(5, "hello")
        self.assertEqual(ap.OUTBOX, [])
        self.assertEqual(self.gh_calls[0][:2], ("issue", "comment"))


class PlanHash(Base):
    def test_plan_that_does_not_match_the_job_output_is_refused(self):
        raw = json.dumps({"kind": "autopilot-plan", "ready": []}).encode()
        (self.tmp / ap.PLAN_FILE).write_bytes(raw)
        with self.assertRaises(SystemExit):
            ap.load_plan(hashlib.sha256(b"something else").hexdigest())
        ap.load_plan(hashlib.sha256(raw).hexdigest())
        self.assertEqual(ap.PLAN["kind"], "autopilot-plan")

    def test_plan_dry_run_cannot_be_turned_off_later(self):
        raw = json.dumps({"kind": "autopilot-plan", "dry_run": True, "max_tasks": 1}).encode()
        (self.tmp / ap.PLAN_FILE).write_bytes(raw)
        ap.ARGS.max_tasks = 3
        ap.load_plan(None)
        self.assertTrue(ap.ARGS.dry_run)
        self.assertEqual(ap.ARGS.max_tasks, 1)


class CheckIntent(Base):
    """Publish refuses anything the plan did not give the work job."""

    def setUp(self):
        super().setUp()
        self.base, self.head = git("rev-parse", "HEAD~1"), git("rev-parse", "HEAD")
        ap.PLAN.update({"base_sha": self.base})
        self.task = ap.Task(7, "Fix the hero", "", [], "u")
        self.tasks = {7: self.task}

    def check(self, intent, seen=None):
        return ap.check_intent(intent, self.tasks, seen if seen is not None else {})

    def pr(self, **over):
        i = {"kind": "open_pr", "issue": 7, "branch": self.task.branch, "sha": self.head, "evidence": "e", "reasons": ["r"]}
        i.update(over)
        return i

    def test_valid_open_pr_passes(self):
        self.assertEqual(self.check(self.pr()), "")

    def test_kinds_only_the_plan_may_send_are_refused(self):
        for kind in ("pr_note", "dispatch_ci", "merge", "anything"):
            self.assertEqual(self.check({"kind": kind, "pr": 1, "branch": "main"}), "unknown kind", kind)

    def test_other_issues_are_refused(self):
        self.assertIn("not a task", self.check({"kind": "comment", "issue": 8, "body": "x"}))
        self.assertIn("not a task", self.check({"kind": "comment", "issue": "7", "body": "x"}))

    def test_push_to_another_branch_is_refused(self):
        self.assertIn("is not", self.check(self.pr(branch="main")))
        self.assertIn("is not", self.check({"kind": "push_branch", "issue": 7, "branch": "autopilot/8-x", "sha": self.head}))

    def test_base_commit_or_unknown_commit_is_refused(self):
        self.assertEqual(self.check(self.pr(sha=self.base)), "commit not in the bundle")
        self.assertEqual(self.check(self.pr(sha="f" * 40)), "commit not in the bundle")
        self.assertEqual(self.check(self.pr(sha="HEAD")), "bad sha")

    def test_commit_not_on_the_plan_base_is_refused(self):
        ap.PLAN["base_sha"] = self.head
        self.assertEqual(self.check(self.pr(sha=self.base)), "commit is not on top of the plan base")

    def test_second_push_for_a_task_is_refused(self):
        seen: dict = {}
        self.assertEqual(self.check(self.pr(), seen), "")
        self.assertEqual(self.check(self.pr(), seen), "second push for this task")

    def test_status_approved_and_bad_telegram_are_refused(self):
        self.assertEqual(self.check({"kind": "status", "issue": 7, "status": "approved"}), "bad status")
        self.assertEqual(self.check({"kind": "telegram", "event": "nope", "text": "x"}), "bad telegram")

    def test_proposals_are_capped(self):
        seen: dict = {}
        p = {"kind": "create_issue", "proposal": {"title": "t"}, "origin": "planner"}
        limit = ap.CONFIG["planner"]["max_proposals"] + 3
        self.assertEqual([self.check(p, seen) for _ in range(limit)], [""] * limit)
        self.assertEqual(self.check(p, seen), "too many proposals")

    def test_quoted_head_cannot_pose_as_the_gated_commit(self):
        self.assertNotIn("Autopilot-Head: ", ap.unquote_head(f"x\nAutopilot-Head: {SHA} (gate)"))


class PlanQueuesMerges(Base):
    """The plan phase checks approvals and CI but never merges: publish does, with the work job's gate result."""

    def setUp(self):
        super().setUp()
        ap.PHASE = "plan"
        self.runs = [{"status": "completed", "conclusion": "success", "run_number": 1, "head_sha": SHA}]
        pr = {"number": 7, "headRefName": "autopilot/7-x", "headRefOid": SHA, "title": "t", "url": "u7",
              "body": f"Autopilot-Head: {SHA} (gate)", "isCrossRepository": False, "author": {"login": "app/github-actions"}}
        label = [{"event": "labeled", "label": {"name": ap.LABELS["approved"]}, "actor": {"login": "bookchaowalit", "type": "User"}}]

        def gh_json(*args):
            if args[0] == "pr":
                return [pr]
            if "actions/workflows" in args[-1]:
                return {"workflow_runs": self.runs}
            return label
        ap.gh_json = gh_json
        self.saved_merge = ap.merge_branch
        ap.merge_branch = lambda *a: self.fail("plan phase must not merge")
        os.environ["VERCEL_FREE_DEPLOYS"] = "50"

    def tearDown(self):
        ap.merge_branch = self.saved_merge
        super().tearDown()

    def test_green_ci_is_queued_not_merged(self):
        ap.merge_approved_prs(ap.Budget())
        self.assertEqual([m["number"] for m in ap.MERGE_QUEUE], [7])
        self.assertEqual(self.gh_calls, [])

    def test_failed_ci_note_is_an_intent(self):
        self.runs[0]["conclusion"] = "failure"
        ap.merge_approved_prs(ap.Budget())
        self.assertEqual(ap.MERGE_QUEUE, [])
        self.assertEqual([i["kind"] for i in ap.OUTBOX], ["pr_note", "telegram"])
        self.assertEqual(self.gh_calls, [])


if __name__ == "__main__":
    unittest.main()
