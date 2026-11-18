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
        ap.BUNDLE_SHAS.clear()
        ap.BUNDLE_SHAS.add(self.head)
        self.saved_touched = ap.agent_config_touched
        ap.agent_config_touched = lambda files: []  # the fixture commit (this repo's HEAD) may touch .autopilot/
        self.task = ap.Task(7, "Fix the hero", "", [], "u")
        self.tasks = {7: self.task}

    def check(self, intent, seen=None):
        return ap.check_intent(intent, self.tasks, seen if seen is not None else {})

    def pr(self, **over):
        i = {"kind": "open_pr", "issue": 7, "branch": self.task.branch, "sha": self.head, "evidence": "e", "reasons": ["r"]}
        i.update(over)
        return i

    def tearDown(self):
        ap.agent_config_touched = self.saved_touched
        super().tearDown()

    def test_open_pr_that_changes_loop_configuration_is_refused(self):
        ap.agent_config_touched = lambda files: [".autopilot/config.json"]
        self.assertIn("agent/loop configuration", self.check(self.pr()))

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

    def test_commit_already_in_the_clone_but_not_from_the_bundle_is_refused(self):
        ap.BUNDLE_SHAS.clear()
        self.assertEqual(self.check(self.pr()), "commit not in the bundle")

    def test_open_pr_and_push_branch_share_one_push_per_task(self):
        seen: dict = {}
        self.assertEqual(self.check(self.pr(), seen), "")
        push = {"kind": "push_branch", "issue": 7, "branch": self.task.branch, "sha": self.head}
        self.assertEqual(self.check(push, seen), "second push for this task")

    def test_a_refused_push_does_not_use_up_the_task_push(self):
        seen: dict = {}
        self.assertIn("is not", self.check({"kind": "push_branch", "issue": 7, "branch": "main", "sha": self.head}, seen))
        self.assertEqual(self.check(self.pr(), seen), "")

    def test_commit_not_on_the_plan_base_is_refused(self):
        ap.BUNDLE_SHAS.add(self.base)
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
        limit = ap.CONFIG["planner"]["max_proposals"] + 3 * len(self.tasks)
        self.assertEqual([self.check(p, seen) for _ in range(limit)], [""] * limit)
        self.assertEqual(self.check(p, seen), "too many proposals")

    def test_quoted_head_cannot_pose_as_the_gated_commit(self):
        self.assertNotIn("Autopilot-Head: ", ap.unquote_head(f"x\nAutopilot-Head: {SHA} (gate)"))


class ApprovedPR(Base):
    """One approved autopilot PR with green CI; subclasses pick the phase."""

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



class PlanQueuesMerges(ApprovedPR):
    """The plan phase checks approvals and CI but never merges: publish does, after re-checking."""

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

    def test_plan_queues_for_the_gate_even_without_a_vercel_count(self):
        # quota is counted again by publish right before it merges; the plan only picks gate candidates
        os.environ.pop("VERCEL_FREE_DEPLOYS", None)
        ap.merge_approved_prs(ap.Budget())
        self.assertEqual([m["number"] for m in ap.MERGE_QUEUE], [7])


class PublishRechecks(ApprovedPR):
    """publish decides merges on fresh GitHub state, not on the plan's snapshot."""

    def setUp(self):
        super().setUp()
        ap.PHASE = "publish"
        self.merged = []
        self.saved_one = ap.merge_one
        ap.merge_one = lambda pr, budget: self.merged.append(pr["number"]) or "c" * 40

    def tearDown(self):
        ap.merge_one = self.saved_one
        super().tearDown()

    def test_ci_that_turned_red_after_the_plan_blocks_the_merge(self):
        self.runs[0]["conclusion"] = "failure"
        ap.merge_approved_prs(ap.Budget())
        self.assertEqual(self.merged, [])

    def test_quota_below_the_floor_at_publish_time_postpones(self):
        os.environ["VERCEL_FREE_DEPLOYS"] = "20"
        b = ap.Budget()
        ap.merge_approved_prs(b)
        self.assertEqual(self.merged, [])
        self.assertEqual([t["outcome"] for t in b.run_tasks], ["postponed_quota"])

    def test_green_ci_and_quota_merge(self):
        ap.merge_approved_prs(ap.Budget())
        self.assertEqual(self.merged, [7])


class MergeGateResult(Base):
    """A merge in publish needs the merge-gate job's passing result for the exact merged tree."""

    def test_agent_config_rule(self):
        self.assertEqual(self.saved_touched_fn([".autopilot/config.json", "src/a.ts", "x/.claude/s.json", "CLAUDE.md"]),
                         [".autopilot/config.json", "x/.claude/s.json", "CLAUDE.md"])

    saved_touched_fn = staticmethod(ap.agent_config_touched)

    def test_usage_that_is_not_a_sane_number_books_the_day_caps(self):
        for calls, usd in ((float("inf"), 1.0), (2, float("nan")), ("3", 1.0), (10 ** 9, 1.0), (True, 0.5)):
            b, errors = ap.Budget(), []
            ap.account_work({"ledger": {"claude_calls": calls, "est_usd": usd}}, b, {"minutes": 0}, errors)
            self.assertEqual(b.run_calls, ap.LIMITS["max_claude_calls_per_day"], (calls, usd))
            self.assertTrue(errors)

    def test_huge_json_int_usd_books_the_caps_without_crashing(self):
        b, errors = ap.Budget(), []
        ap.account_work({"ledger": {"claude_calls": 1, "est_usd": 10 ** 400}}, b, {"minutes": 0}, errors)
        self.assertEqual(b.run_usd, float(ap.LIMITS["max_est_usd_per_day"]))

    def test_sane_usage_is_booked_as_reported(self):
        b, errors = ap.Budget(), []
        ap.account_work({"ledger": {"claude_calls": 3, "est_usd": 1.25, "minutes": 9}}, b, {"minutes": 0}, errors)
        self.assertEqual((b.run_calls, b.run_usd, errors), (3, 1.25, []))

    def test_waiting_gate_does_not_count_as_a_failure(self):
        b = ap.Budget(recent_outcomes=["waiting_gate", "waiting_gate", "waiting_gate", "blocked"])
        self.assertEqual(ap.consecutive_failures(b), 1)


if __name__ == "__main__":
    unittest.main()


class LedgerRerun(Base):
    """A re-run of the publish job writes the same work run again: the day counts it once.
    A re-run of the whole workflow is a new work run (new attempt) and counts again."""

    def test_same_work_run_counts_once_new_attempt_counts_again(self):
        def entry(created, calls, wid="1-1-abc"):
            e = {"kind": "autopilot-run", "date": ap.now_bkk().date().isoformat(), "claude_calls": calls, "est_usd": 1,
                 "run_url": "https://github.com/x/y/actions/runs/1", "work_id": wid, "tasks": []}
            return {"created_at": created, "user": {"login": ap.CONFIG["backlog"]["ledger_author"]}, "body": "```json\n" + json.dumps(e) + "\n```"}

        def gh_json(*args):
            if args[0] == "issue":
                return [{"number": 1, "title": ap.CONFIG["backlog"]["ledger_issue_title"], "author": {"login": "app/github-actions"}}]
            return [entry("2026-11-18T01:00:00Z", 4), entry("2026-11-18T01:05:00Z", 4), entry("2026-11-18T02:00:00Z", 2, "1-2-abc")]
        ap.gh_json = gh_json
        ap.ARGS.dry_run = True
        b = ap.load_budget()
        self.assertEqual(b.calls_today, 6)
        self.assertEqual(sorted(b.work_ids), ["1-1-abc", "1-2-abc"])


class PublishStillApproved(Base):
    def test_closed_or_unlabelled_issue_is_not_published(self):
        rows = {1: {"state": "OPEN", "labels": [{"name": "autopilot"}, {"name": ap.LABELS["todo"]}]},
                2: {"state": "CLOSED", "labels": [{"name": "autopilot"}, {"name": ap.LABELS["todo"]}]},
                3: {"state": "OPEN", "labels": [{"name": "autopilot"}]}}
        ap.gh_json = lambda *a: rows[int(a[2])]
        self.assertEqual([ap.still_approved(n) for n in (1, 2, 3)], [True, False, False])


class PublishMergeBranch(Base):
    """merge_branch in publish: preflight must pass; a merged tree needs a passing merge-gate result."""

    HEAD, MERGED = "h" * 40, "m" * 40

    def setUp(self):
        super().setUp()
        ap.PHASE = "publish"
        ap.ARGS.dry_run = True  # no fetch/pull/push: only the decision
        ap.MERGE_GATES.clear()
        ap._GATE_MISSING.clear()
        self.trees = {"branch": "T1", "merged": "T1"}
        self.saved_git, self.saved_run = ap.git, ap.run

        def git(*a, **k):
            if a[0] != "rev-parse":
                return ""
            return {"HEAD": self.MERGED, "autopilot/7-x": self.HEAD, "autopilot/7-x^{tree}": self.trees["branch"],
                    "HEAD^{tree}": self.trees["merged"]}.get(a[1], "")
        ap.git = git
        ap.run = lambda *a, **k: (0, "")

    def tearDown(self):
        ap.git, ap.run = self.saved_git, self.saved_run
        ap.MERGE_GATES.clear()
        super().tearDown()

    def merge(self):
        return ap.merge_branch("autopilot/7-x", "msg")

    def test_no_preflight_result_blocks_even_a_same_tree_merge(self):
        self.assertEqual(self.merge(), "")
        self.assertTrue(ap._GATE_MISSING)

    def test_preflight_on_another_main_does_not_count(self):
        ap.MERGE_GATES.update(preflight_ok=True, base_sha="o" * 40, gates={})
        self.assertEqual(self.merge(), "")
        self.assertTrue(ap._GATE_MISSING)

    def test_same_tree_merges_after_preflight(self):
        ap.MERGE_GATES.update(preflight_ok=True, base_sha=self.MERGED, gates={})
        self.assertEqual(self.merge(), self.MERGED)

    def test_moved_main_without_a_result_waits(self):
        self.trees["merged"] = "T2"
        ap.MERGE_GATES.update(preflight_ok=True, base_sha=self.MERGED, gates={})
        self.assertEqual(self.merge(), "")
        self.assertTrue(ap._GATE_MISSING)

    def test_failed_gate_is_a_failure_not_a_wait(self):
        self.trees["merged"] = "T2"
        ap.MERGE_GATES.update(preflight_ok=True, base_sha=self.MERGED, gates={"autopilot/7-x": {"head": self.HEAD, "ok_trees": [], "failed_trees": ["T2"]}})
        self.assertEqual(self.merge(), "")
        self.assertFalse(ap._GATE_MISSING)

    def test_passing_gate_for_another_head_does_not_count(self):
        self.trees["merged"] = "T2"
        ap.MERGE_GATES.update(preflight_ok=True, base_sha=self.MERGED, gates={"autopilot/7-x": {"head": "z" * 40, "ok_trees": ["T2"]}})
        self.assertEqual(self.merge(), "")

    def test_passing_gate_for_this_tree_merges(self):
        self.trees["merged"] = "T2"
        ap.MERGE_GATES.update(preflight_ok=True, base_sha=self.MERGED, gates={"autopilot/7-x": {"head": self.HEAD, "ok_trees": ["T2"]}})
        self.assertEqual(self.merge(), self.MERGED)


class IntentKinds(Base):
    def test_issue_field_on_other_kinds_is_ignored_safely(self):
        # telegram with an odd extra "issue" must not crash publish before the ledger
        i = {"kind": "telegram", "event": "task_blocked", "text": "x", "issue": [1, 2]}
        self.assertEqual(ap.check_intent(i, {}, {}), "")
        issue = i.get("issue") if i.get("kind") in ap.ISSUE_KINDS else None
        self.assertIsNone(issue)
