"""Merge gate: an approved autopilot PR merges only when CI on the gated commit is green.

Run: python3 -m unittest discover -s .autopilot/tests
"""

import argparse
import importlib.util
import sys
import unittest
from typing import Any
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("autopilot", HERE / "autopilot.py")
assert spec and spec.loader
ap: Any = importlib.util.module_from_spec(spec)
sys.modules["autopilot"] = ap
spec.loader.exec_module(ap)

SHA = "a" * 40


def run(status: str, conclusion: str | None = None, number: int = 1, sha: str = SHA) -> dict:
    return {"status": status, "conclusion": conclusion, "run_number": number, "head_sha": sha}


class CiVerdict(unittest.TestCase):
    def test_no_run_is_missing(self):
        self.assertEqual(ap.ci_verdict([], SHA), "missing")

    def test_runs_for_another_commit_do_not_count(self):
        self.assertEqual(ap.ci_verdict([run("completed", "success", sha="b" * 40)], SHA), "missing")

    def test_queued_or_running_is_pending(self):
        self.assertEqual(ap.ci_verdict([run("queued")], SHA), "pending")
        self.assertEqual(ap.ci_verdict([run("in_progress")], SHA), "pending")

    def test_latest_success_is_success(self):
        self.assertEqual(ap.ci_verdict([run("completed", "failure", 1), run("completed", "success", 2)], SHA), "success")

    def test_latest_failure_is_failed(self):
        for bad in ("failure", "timed_out", "startup_failure"):
            self.assertEqual(ap.ci_verdict([run("completed", "success", 1), run("completed", bad, 2)], SHA), "failed", bad)

    def test_cancelled_or_skipped_latest_needs_a_new_run(self):
        # CI cancels in-progress runs for the same ref, so a cancelled run says nothing about the code
        self.assertEqual(ap.ci_verdict([run("completed", "cancelled")], SHA), "missing")
        self.assertEqual(ap.ci_verdict([run("completed", "skipped")], SHA), "missing")

    def test_run_held_for_approval_needs_a_dispatched_run(self):
        # a pull_request run started by the bot waits for "Approve and run" (action_required):
        # that says nothing about the code, and a workflow_dispatch run needs no approval
        self.assertEqual(ap.ci_verdict([run("completed", "action_required")], SHA), "missing")

    def test_a_running_rerun_wins_over_an_older_result(self):
        self.assertEqual(ap.ci_verdict([run("completed", "failure", 1), run("in_progress", None, 2)], SHA), "pending")


class MergeGate(unittest.TestCase):
    """merge_approved_prs: CI must be green on the approved head before anything merges."""

    def setUp(self):
        ap._DISPATCHED.clear()
        ap.ARGS = argparse.Namespace(dry_run=False, sandbox=False, max_tasks=1)
        self.calls = []
        self.merged = []
        self.runs = []
        pr = {"number": 7, "headRefName": "autopilot/7-x", "headRefOid": SHA, "title": "t", "url": "u7",
              "body": f"Autopilot-Head: {SHA} (gate)", "isCrossRepository": False, "author": {"login": "app/github-actions"}}
        label = [{"event": "labeled", "label": {"name": ap.LABELS["approved"]}, "actor": {"login": "bookchaowalit", "type": "User"}}]

        def gh_json(*args):
            if args[0] == "pr":
                return [pr]
            if "actions/workflows" in args[-1]:
                return {"workflow_runs": self.runs}
            return label

        self.saved = (ap.gh_json, ap.gh, ap.telegram, ap.merge_branch, ap.git, ap.reset_to_base)
        ap.gh_json = gh_json
        ap.gh = lambda *a, **k: self.calls.append(a) or ""
        ap.telegram = lambda event, text: self.calls.append(("telegram", event))
        ap.merge_branch = lambda branch, message: self.merged.append(branch) or "c" * 40
        ap.git = lambda *a, **k: SHA if a[:1] == ("rev-parse",) else ""
        ap.reset_to_base = lambda: None
        import os
        os.environ["VERCEL_FREE_DEPLOYS"] = "50"

    def tearDown(self):
        ap.gh_json, ap.gh, ap.telegram, ap.merge_branch, ap.git, ap.reset_to_base = self.saved

    def outcomes(self):
        b = ap.Budget()
        ap.merge_approved_prs(b)
        return [t["outcome"] for t in b.run_tasks]

    def test_green_ci_merges(self):
        self.runs = [run("completed", "success")]
        self.assertEqual(self.outcomes(), ["merged"])
        self.assertEqual(self.merged, ["autopilot/7-x"])

    def test_pending_ci_waits(self):
        self.runs = [run("in_progress")]
        self.assertEqual(self.outcomes(), ["waiting_ci"])
        self.assertEqual(self.merged, [])

    def test_missing_ci_is_dispatched_and_waits(self):
        self.runs = []
        self.assertEqual(self.outcomes(), ["waiting_ci"])
        self.assertIn(("workflow", "run"), [c[:2] for c in self.calls])
        self.assertEqual(self.merged, [])

    def test_failed_ci_removes_the_label_and_does_not_merge(self):
        self.runs = [run("completed", "failure")]
        self.assertEqual(self.outcomes(), ["ci_failed"])
        self.assertEqual(self.merged, [])
        edits = [c for c in self.calls if c[:2] == ("pr", "edit")]
        self.assertTrue(any(ap.LABELS["approved"] in c for c in edits))
        self.assertIn(("pr", "comment"), [c[:2] for c in self.calls])


if __name__ == "__main__":
    unittest.main()
