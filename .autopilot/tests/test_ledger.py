"""Ledger: the circuit breaker only counts outcomes after the newest pause.

The issue-comments API returns comments oldest first (it ignores sort/direction), so the
loop must order them itself. Run: python3 -m unittest discover -s .autopilot/tests
"""

import argparse
import importlib.util
import json
import sys
import unittest
from pathlib import Path
from typing import Any

HERE = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location("autopilot_ledger", HERE / "autopilot.py")
assert spec and spec.loader
ap: Any = importlib.util.module_from_spec(spec)
sys.modules["autopilot_ledger"] = ap
spec.loader.exec_module(ap)

BOT = "github-actions[bot]"


def comment(created: str, outcomes: list[str], paused: bool = False, date: str = "2026-10-20") -> dict:
    entry = {"kind": "autopilot-run", "date": date, "claude_calls": 1, "est_usd": 0.1, "paused": paused,
             "tasks": [{"outcome": o} for o in outcomes]}
    return {"created_at": created, "user": {"login": BOT}, "body": "```json\n" + json.dumps(entry) + "\n```"}


class LedgerOrder(unittest.TestCase):
    def setUp(self):
        ap.ARGS = argparse.Namespace(dry_run=True, sandbox=False, max_tasks=1)
        self.saved = ap.gh_json

    def tearDown(self):
        ap.gh_json = self.saved

    def budget(self, comments_as_returned):
        def gh_json(*args):
            if args[0] == "issue":
                return [{"number": 1, "title": ap.CONFIG["backlog"]["ledger_issue_title"], "author": {"login": "app/github-actions"}}]
            return comments_as_returned
        ap.gh_json = gh_json
        return ap.load_budget()

    def test_failures_before_the_pause_do_not_count_oldest_first(self):
        oldest_first = [comment("2026-10-24T18:00:00Z", ["blocked"]),
                        comment("2026-10-24T21:00:00Z", ["blocked", "blocked"]),
                        comment("2026-10-24T23:43:00Z", [], paused=True)]
        self.assertEqual(self.budget(oldest_first).recent_outcomes, [])

    def test_outcomes_after_the_pause_count_newest_first(self):
        oldest_first = [comment("2026-10-24T18:00:00Z", ["blocked", "blocked", "blocked"]),
                        comment("2026-10-24T23:43:00Z", [], paused=True),
                        comment("2026-10-25T18:00:00Z", ["pr_opened"]),
                        comment("2026-10-25T21:00:00Z", ["blocked"])]
        self.assertEqual(self.budget(oldest_first).recent_outcomes, ["blocked", "pr_opened"])

    def test_paginated_pages_are_flattened(self):
        pages = [[comment("2026-10-24T18:00:00Z", ["blocked"])], [comment("2026-10-25T18:00:00Z", ["pr_opened"])]]
        self.assertEqual(self.budget(pages).recent_outcomes, ["pr_opened", "blocked"])


if __name__ == "__main__":
    unittest.main()
