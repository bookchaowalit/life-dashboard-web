#!/usr/bin/env python3
"""Autopilot loop: pick a backlog issue, let Claude implement it, gate it, merge it, repeat.

One invocation is one *run*. A run works through up to ``limits.max_tasks_per_run``
issues and stops early on any stop condition (budget, rate limit, pause, wall time,
empty backlog). Every decision is written to the issue, the ledger issue and Telegram,
so there is an evidence trail without anybody watching.

Usage:
    python3 .autopilot/autopilot.py              # real run (CI)
    python3 .autopilot/autopilot.py --dry-run    # read-only: show what the run would do
    python3 .autopilot/autopilot.py --sandbox    # real agents and gates, but no push, no
                                                 # GitHub writes; Telegram tagged [sandbox]

Environment:
    GH_TOKEN                      gh CLI auth (GITHUB_TOKEN in Actions)
    CLAUDE_CODE_OAUTH_TOKEN       Claude Code auth in CI (from `claude setup-token`)
    TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID (or Infisical's TELEGRAM_NOTI_BOT_TOKEN / _CHAT_ID)
    AUTOPILOT_SKILLS_DIR          checkout of platform-agent-skills (visual gate)
    VERCEL_FREE_DEPLOYS           free Vercel deployments in the rolling 24 h, counted by the
                                  workflow before this step (pr-approval mode: no merge without it)
    PLAYWRIGHT_MODULE             path to the playwright package (visual gate)
"""

from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import math
import os
import re
import shutil
import signal
import subprocess
import sys
import textwrap
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
HERE = ROOT / ".autopilot"
CONFIG = json.loads((HERE / "config.json").read_text())
LIMITS = CONFIG["limits"]
LABELS = CONFIG["backlog"]["status_labels"]
BASE = CONFIG["default_branch"]
REPO = CONFIG["repo"]
BKK = dt.timezone(dt.timedelta(hours=7))
RUN_STARTED = time.monotonic()
WORK = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "autopilot"
P_FINDING = re.compile(r"^\s*(?:[-*]\s*)?\[(P[0-3])\]\s*(.+)$", re.M)
RATE_LIMIT = re.compile(r"usage limit|rate.?limit|limit reached|overloaded|too many requests|quota", re.I)
JSON_BLOCK = re.compile(r"```json\s*(\{.*?\})\s*```", re.S)
TRAILER = "\n\nCo-Authored-By: Claude <noreply@anthropic.com>"

ARGS: argparse.Namespace

# Split jobs (--phase): plan (read-only GitHub token + Vercel count, runs no repo code) → work (Claude
# token only: maker, gates, reviewers; GitHub writes become *intents*) → publish (write token +
# Telegram: checks every intent against the plan, pushes exactly the gated commits from the bundle).
# --phase all (default) is the old single-process loop, kept for local --sandbox and --dry-run.
PHASE = "all"
OUTBOX: list[dict] = []   # intents recorded by the plan and work phases
PLAN: dict = {}           # plan.json (plan phase output), read by work and publish
MERGE_QUEUE: list[dict] = []  # approved PRs the plan phase cleared for a merge in publish
MERGE_GATES: dict = {}    # publish: merge-gate job output {"preflight_ok", "gates": {branch: {"head", "ok_trees"}}}
BUNDLE_SHAS: set[str] = set()  # publish: commits imported from the verified work bundle
_GATE_MISSING: list[str] = []  # publish: merge waited for a gate result on the current merged tree


class StopRun(Exception):
    """Raised when the whole run must stop (budget, rate limit, pause, wall time)."""

    def __init__(self, reason: str, event: str = "run_error"):
        super().__init__(reason)
        self.reason, self.event = reason, event


# --------------------------------------------------------------------------- utils

def now_bkk() -> dt.datetime:
    return dt.datetime.now(BKK)


def log(msg: str) -> None:
    print(f"[autopilot {now_bkk():%H:%M:%S}] {msg}", flush=True)


SECRET_ENV = ("GH_TOKEN", "GITHUB_TOKEN", "CLAUDE_CODE_OAUTH_TOKEN", "TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID",
              "TELEGRAM_NOTI_BOT_TOKEN", "TELEGRAM_NOTI_CHAT_ID", "VERCEL_TOKEN", "VERCEL_TEAM_ID",
              "ACTIONS_RUNTIME_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_TOKEN", "ACTIONS_ID_TOKEN_REQUEST_URL")


def code_env(keep: tuple[str, ...] = ()) -> dict[str, str]:
    """Environment for repo code and agents: no credentials except the ones named in ``keep``."""
    return {k: v for k, v in os.environ.items() if k not in SECRET_ENV or k in keep}


# git never runs repo-controlled hooks or fsmonitor, and its security-relevant config (credential
# helpers, url rewrites, aliases, includes, …) must not change while the run executes repo code.
# git and gh are resolved once, before any repo code runs, so a planted binary on PATH is not used.
GIT_BIN, GH_BIN = shutil.which("git") or "git", shutil.which("gh") or "gh"
# gh reads GH_TOKEN; its config dir is a fresh one made here, and it must never gain a config.yml
# or hosts.yml (http_unix_socket, aliases, …) written by repo code.
import tempfile  # noqa: E402
os.environ["GH_CONFIG_DIR"] = tempfile.mkdtemp(prefix="autopilot-gh-")
GIT_SAFE = [GIT_BIN, "-c", "core.hooksPath=/dev/null", "-c", "core.fsmonitor=false"]
_GIT_CONFIG_PRINT: list[str] = []


def git_config_print() -> str:
    out = subprocess.run([GIT_BIN, "config", "--list", "--show-origin", "-z"], cwd=ROOT, capture_output=True, text=True,
                         env=code_env()).stdout
    # branch.<name>.remote/.merge are written by the loop's own `checkout -B`; everything else must stay as it was.
    # -z: entries are "origin\0key\nvalue\0", so a value cannot pose as a key.
    parts = out.split("\0")
    kept = [f"{o}\0{e}" for o, e in zip(parts[0::2], parts[1::2])
            if not re.fullmatch(r"branch\.[^\n]+\.(remote|merge)", e.split("\n", 1)[0])]
    return hashlib.sha256("\0".join(kept).encode()).hexdigest()


def run(cmd: list[str] | str, *, cwd: Path = ROOT, timeout: int = 900, env: dict | None = None,
        stdin: str | None = None, check: bool = False) -> tuple[int, str]:
    # Only the loop's own git and gh calls get credentials. Everything else (npm scripts the maker
    # may have changed, next start, node ui_review, curl) runs with code_env().
    shell = isinstance(cmd, str)
    privileged = not shell and cmd[0] in ("git", "gh")
    if not shell and cmd[0] == "git":
        current = git_config_print()
        if not _GIT_CONFIG_PRINT:
            _GIT_CONFIG_PRINT.append(current)
        elif current != _GIT_CONFIG_PRINT[0]:
            raise StopRun("git config เปลี่ยนระหว่าง run (อาจมีโค้ดใน repo แก้ credential/hook) — หยุดก่อนใช้ token", "paused")
        cmd = GIT_SAFE + list(cmd[1:])
    elif not shell and cmd[0] == "gh":
        if any((Path(os.environ["GH_CONFIG_DIR"]) / f).exists() for f in ("config.yml", "hosts.yml")):
            raise StopRun("gh config ถูกสร้างระหว่าง run (อาจมีโค้ดใน repo แก้) — หยุดก่อนใช้ token", "paused")
        cmd = [GH_BIN, *cmd[1:]]
    proc = subprocess.Popen(cmd, cwd=cwd, shell=shell, text=True, stdin=subprocess.PIPE if stdin is not None else subprocess.DEVNULL,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=not privileged,
                            env={**code_env(keep=("GH_TOKEN",) if privileged else ()), **(env or {})})
    code = None
    try:
        so, se = proc.communicate(stdin, timeout=timeout)
        out, code = (so or "") + (("\n" + se) if se else ""), proc.returncode
    except subprocess.TimeoutExpired:
        out, code = f"TIMEOUT after {timeout}s", 124
    finally:
        if not privileged:  # repo code leaves nothing running behind (servers, watchers, daemons)
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except (ProcessLookupError, PermissionError):
                pass
        if code == 124:
            proc.kill()
            proc.communicate()
    if check and code != 0:
        raise RuntimeError(f"{cmd!r} exited {code}: {tail(out)}")
    return code, out


def tail(text: str, lines: int = 40, chars: int = 3500) -> str:
    return "\n".join(text.strip().splitlines()[-lines:])[-chars:]


def git(*args: str, check: bool = True, timeout: int = 300) -> str:
    return run(["git", *args], check=check, timeout=timeout)[1].strip()


def last_json(text: str) -> dict[str, Any] | None:
    blocks = JSON_BLOCK.findall(text or "")
    for raw in reversed(blocks):
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            continue
    return None


def fingerprint(text: str) -> str:
    norm = re.sub(r"\d+", "#", re.sub(r"\s+", " ", text.lower()))[:4000]
    return hashlib.sha1(norm.encode()).hexdigest()[:12]


def minutes_used() -> float:
    return (time.monotonic() - RUN_STARTED) / 60


def esc(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:40] or "task"


# --------------------------------------------------------------------------- telegram

def telegram(event: str, text: str) -> None:
    if not CONFIG["notify"].get("telegram") or event not in CONFIG["notify"]["events"] + ["run_summary"]:
        return
    if deferred():
        emit("telegram", event=event, text=text)
        return
    token = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_NOTI_BOT_TOKEN")
    chat = os.environ.get("TELEGRAM_CHAT_ID") or os.environ.get("TELEGRAM_NOTI_CHAT_ID")
    prefix = "[sandbox] " if ARGS.sandbox else ""
    if ARGS.dry_run or not token or not chat:
        log(f"telegram({event}) skipped: {text[:120]!r}")
        return
    body = urllib.parse.urlencode({
        "chat_id": chat, "parse_mode": "HTML", "disable_web_page_preview": "true",
        "text": f"🤖 <b>{prefix}Autopilot · {esc(REPO.split('/')[-1])}</b>\n{text}"[:4000],
    }).encode()
    for attempt in range(3):
        try:
            urllib.request.urlopen(f"https://api.telegram.org/bot{token}/sendMessage", body, timeout=20).read()
            return
        except urllib.error.HTTPError as e:  # never let a notification failure stop the loop
            log(f"telegram failed: HTTP {e.code}")
            if e.code < 500 and e.code != 429:
                return
        except Exception as e:
            log(f"telegram failed: {type(e).__name__} (try {attempt + 1}/3)")
        time.sleep(3 * (attempt + 1))


# --------------------------------------------------------------------------- github

def gh(*args: str, check: bool = True, stdin: str | None = None) -> str:
    return run(["gh", *args], check=check, stdin=stdin, timeout=120)[1].strip()


def gh_json(*args: str) -> Any:
    out = gh(*args)
    return json.loads(out) if out else None


def writes_allowed() -> bool:
    return not (ARGS.dry_run or ARGS.sandbox)


def deferred() -> bool:
    """Plan and work phases hold no write token: their GitHub writes and notifications become intents."""
    return PHASE in ("plan", "merge-gate", "work")


def emit(kind: str, **fields: Any) -> None:
    OUTBOX.append({"kind": kind, **fields})
    log(f"intent {kind}: {json.dumps(fields, ensure_ascii=False)[:160]}")


def issue_comment(number: int, body: str) -> None:
    if deferred():
        emit("comment", issue=number, body=body)
    elif writes_allowed():
        gh("issue", "comment", str(number), "--repo", REPO, "--body-file", "-", stdin=body)
    else:
        log(f"(no write) comment on #{number}: {body[:160]!r}")


def set_status(number: int, status: str) -> None:
    remove = [v for k, v in LABELS.items() if k not in (status, "approved")]
    if deferred():
        emit("status", issue=number, status=status)
    elif writes_allowed():
        gh("issue", "edit", str(number), "--repo", REPO, "--add-label", LABELS[status],
           *sum((["--remove-label", label] for label in remove), []), check=False)
    else:
        log(f"(no write) #{number} → {status}")


def clear_status(number: int) -> None:
    if deferred():
        emit("status", issue=number, status="clear")
    elif writes_allowed():
        gh("issue", "edit", str(number), "--repo", REPO,
           *sum((["--remove-label", v] for k, v in LABELS.items() if k != "approved"), []), check=False)


def ensure_labels() -> None:
    wanted = {CONFIG["backlog"]["label"]: "5319e7", **{v: "c5def5" for v in LABELS.values()},
              **{p: "fbca04" for p in CONFIG["backlog"]["priority_labels"]},
              **{v: "bfd4f2" for v in CONFIG["backlog"]["risk_labels"].values()},
              "autopilot:paused": "b60205"}
    have = {label["name"] for label in gh_json("label", "list", "--repo", REPO, "-L", "200", "--json", "name")}
    for name, color in wanted.items():
        if name not in have and writes_allowed():
            gh("label", "create", name, "--repo", REPO, "--color", color, check=False)


@dataclass
class Task:
    number: int
    title: str
    body: str
    labels: list[str]
    url: str

    @property
    def priority(self) -> int:
        for i, p in enumerate(CONFIG["backlog"]["priority_labels"]):
            if p in self.labels:
                return i
        return len(CONFIG["backlog"]["priority_labels"])

    @property
    def risk(self) -> str:
        for name, label in CONFIG["backlog"]["risk_labels"].items():
            if label in self.labels:
                return name
        return "medium"

    @property
    def ui_pages(self) -> list[str]:
        m = re.search(r"^##\s*UI pages\s*\n(.*?)(?:\n##|\Z)", self.body, re.S | re.M | re.I)
        return re.findall(r"`?(/[^\s`]*)`?", m.group(1)) if m else []

    @property
    def depends_on(self) -> list[int]:
        return [int(n) for n in re.findall(r"depends on #(\d+)", self.body, re.I)]

    @property
    def branch(self) -> str:
        return f"{CONFIG['branch_prefix']}{self.number}-{slug(self.title)}"

    @property
    def doc_path(self) -> str:
        return f"docs/autopilot/tasks/{self.number:04d}-{slug(self.title)}.md"


def list_tasks(status: str) -> list[Task]:
    rows = gh_json("issue", "list", "--repo", REPO, "--state", "open", "-L", "100",
                   "--label", CONFIG["backlog"]["label"], "--label", LABELS[status],
                   "--json", "number,title,body,labels,url,author") or []
    trusted = set(CONFIG["backlog"]["trusted_authors"])
    for r in rows:
        if (r.get("author") or {}).get("login") not in trusted:
            log(f"#{r['number']}: author {(r.get('author') or {}).get('login')!r} is not in backlog.trusted_authors — skipped")
    tasks = [Task(r["number"], r["title"], r["body"] or "", [x["name"] for x in r["labels"]], r["url"])
             for r in rows if (r.get("author") or {}).get("login") in trusted]
    return sorted(tasks, key=lambda t: (t.priority, t.number))


def issue_closed(number: int) -> bool:
    return gh_json("issue", "view", str(number), "--repo", REPO, "--json", "state")["state"] == "CLOSED"


def paused_issue() -> dict | None:
    rows = gh_json("issue", "list", "--repo", REPO, "--state", "open", "--label", "autopilot:paused",
                   "--json", "number,title,url") or []
    return rows[0] if rows else None


def pause(reason: str) -> None:
    if deferred():
        emit("pause", reason=reason)
        return
    if writes_allowed() and not paused_issue():
        gh("issue", "create", "--repo", REPO, "--title", "Autopilot paused", "--label", "autopilot:paused",
           "--body-file", "-", stdin=f"Autopilot หยุดตัวเองเพราะ: {reason}\n\nแก้สาเหตุแล้ว **ปิด issue นี้** เพื่อให้ run ถัดไปทำงานต่อ")
    telegram("paused", f"⏸️ หยุด autopilot ชั่วคราว\nสาเหตุ: {esc(reason)}\nแก้แล้วปิด issue “Autopilot paused” เพื่อให้ทำต่อ")


# --------------------------------------------------------------------------- ledger / budget

@dataclass
class Budget:
    calls_today: int = 0
    tasks_today: int = 0
    usd_today: float = 0.0
    recent_outcomes: list[str] = field(default_factory=list)
    run_calls: int = 0
    run_usd: float = 0.0
    run_tasks: list[dict] = field(default_factory=list)
    ledger_issue: int | None = None
    history_closed: bool = False
    paused: bool = False

    def charge(self, usd: float) -> None:
        self.calls_today += 1
        self.run_calls += 1
        self.usd_today += usd
        self.run_usd += usd

    def check(self, task_usd: float = 0.0) -> None:
        if self.calls_today >= LIMITS["max_claude_calls_per_day"]:
            raise StopRun(f"ครบเพดาน Claude {LIMITS['max_claude_calls_per_day']} ครั้ง/วัน", "budget_hit")
        if self.usd_today >= LIMITS["max_est_usd_per_day"]:
            raise StopRun(f"ครบเพดานประมาณการ ${LIMITS['max_est_usd_per_day']}/วัน", "budget_hit")
        if minutes_used() >= LIMITS["max_run_minutes"]:
            raise StopRun(f"run ใช้เวลาครบ {LIMITS['max_run_minutes']} นาที", "run_summary")


def nonneg(value: Any) -> float:
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0 else 0


def load_budget() -> Budget:
    b = Budget()
    title = CONFIG["backlog"]["ledger_issue_title"]
    rows = gh_json("issue", "list", "--repo", REPO, "--state", "all", "--search", f'"{title}" in:title',
                   "--json", "number,title,author") or []
    rows = [r for r in rows if r["title"] == title and (r.get("author") or {}).get("login") in CONFIG["backlog"]["trusted_authors"]]
    if not rows:
        if writes_allowed() and not deferred():  # plan phase: publish creates it (ensure_ledger_issue)
            b.ledger_issue = create_ledger_issue()
        return b
    b.ledger_issue = rows[0]["number"]
    # The issue-comments API returns oldest first and ignores sort/direction: fetch every page and
    # order newest first here, or the breaker counts failures from before the last pause.
    pages = gh_json("api", "--paginate", "--slurp", f"repos/{REPO}/issues/{b.ledger_issue}/comments?per_page=100") or []
    data = [c for page in pages for c in (page if isinstance(page, list) else [page])]
    data.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    today = now_bkk().date().isoformat()
    runs_seen: set[str] = set()
    for c in data:
        if (c.get("user") or {}).get("login") != CONFIG["backlog"]["ledger_author"]:
            continue  # somebody else's comment cannot lower the day's usage
        entry = last_json(c.get("body", ""))
        if not entry or entry.get("kind") != "autopilot-run":
            continue
        run_id = str(entry.get("run_url") or "")
        if run_id.startswith("http"):
            if run_id in runs_seen:
                continue  # a re-run of the publish job: count the run once (newest entry wins)
            runs_seen.add(run_id)
        if entry.get("date") == today and not entry.get("sandbox"):
            b.calls_today += nonneg(entry.get("claude_calls"))
            b.usd_today += nonneg(entry.get("est_usd"))
            b.tasks_today += len([t for t in entry.get("tasks", []) if counts_as_task(t)])
        if entry.get("paused"):
            b.history_closed = True
        if not b.history_closed:
            b.recent_outcomes.extend(reversed([t.get("outcome", "") for t in entry.get("tasks", [])]))
    return b


def create_ledger_issue() -> int:
    url = gh("issue", "create", "--repo", REPO, "--title", CONFIG["backlog"]["ledger_issue_title"], "--body-file", "-",
             stdin="บันทึกการทำงานของ autopilot หนึ่ง comment ต่อหนึ่ง run (JSON) ใช้คิดเพดานโควตารายวัน ห้ามลบ")
    return int(url.rstrip("/").split("/")[-1])


def counts_as_task(t: dict) -> bool:
    if CONFIG["merge"]["mode"] == "pr-approval":
        return "attempts" in t  # a task the maker worked on (merges of approved PRs do not count)
    return t.get("outcome") == "merged"


def write_ledger(b: Budget, stop_reason: str, minutes: float | None = None) -> None:
    entry = {"kind": "autopilot-run", "date": now_bkk().date().isoformat(), "at": now_bkk().isoformat(timespec="seconds"),
             "run_url": run_url(), "sandbox": ARGS.sandbox, "claude_calls": b.run_calls,
             "est_usd": round(b.run_usd, 3), "minutes": round(minutes_used() if minutes is None else minutes, 1), "stop_reason": stop_reason,
             "tasks": b.run_tasks, "paused": b.paused}
    body = f"Run {entry['at']} — {stop_reason}\n\n```json\n{json.dumps(entry, ensure_ascii=False, indent=1)}\n```"
    if b.ledger_issue and writes_allowed():
        issue_comment(b.ledger_issue, body)
    else:
        log("ledger entry:\n" + body)


def run_url() -> str:
    if os.environ.get("GITHUB_RUN_ID"):
        return f"{os.environ.get('GITHUB_SERVER_URL', 'https://github.com')}/{REPO}/actions/runs/{os.environ['GITHUB_RUN_ID']}"
    return "local"


# --------------------------------------------------------------------------- claude

# Checkers get no shell: `git diff --output=…`/`--ext-diff` can write files or run programs. The loop
# writes the diff and log for them with its own safe git (review_diff()).
READ_ONLY_TOOLS = "Read,Glob,Grep"
# Open issues filed from the Measure/Learn loop (architecture-docs
# docs/lifecycle/OUTCOME-REVIEW-TO-BACKLOG.md). The planner sees them as signals.
SIGNAL_LABELS = ("source:sentry", "source:outcome-review", "source:incident", "source:experiment")
MAKER_TOOLS = ("Read,Edit,Write,Glob,Grep,Bash(npm test:*),Bash(npm run lint:*),Bash(npm run build:*),"
               "Bash(npm run typecheck:*),Bash(npx vitest:*),"
               "Bash(npx tsc:*),Bash(node --test:*),Bash(git status:*),Bash(git diff:*),Bash(git log:*),"
               "Bash(ls:*),Bash(mkdir:*)")
MAKER_DENY = "Edit(./.git/**),Write(./.git/**),Bash(git commit:*),Bash(git push:*),Bash(git reset:*),Bash(vercel:*),Bash(npx vercel:*),Bash(npm install:*),Bash(curl:*),WebFetch,WebSearch"


def claude(prompt: str, *, budget: Budget, max_turns: int, tools: str, deny: str = "", role: str) -> dict[str, Any]:
    budget.check()
    if ARGS.dry_run:
        return {"ok": False, "text": "", "usd": 0.0, "dry": True}
    cmd = ["claude", "-p", "--output-format", "json", "--max-turns", str(max_turns),
           "--permission-mode", "acceptEdits", "--allowedTools", tools]
    env = code_env(keep=("CLAUDE_CODE_OAUTH_TOKEN",))
    if role != "maker":
        # checkers never load project/local settings (hooks, permissions) from the tree the maker wrote,
        # and get an empty config dir so nothing repo code wrote under ~/.claude reaches them either
        cmd += ["--setting-sources", "user"]
        env["CLAUDE_CONFIG_DIR"] = tempfile.mkdtemp(prefix=f"autopilot-{role}-")
    if deny:
        cmd += ["--disallowedTools", deny]
    log(f"claude[{role}] start (turns≤{max_turns})")
    try:
        p = subprocess.run(cmd, cwd=ROOT, input=prompt, text=True, capture_output=True,
                           timeout=LIMITS["max_task_minutes"] * 60, env=env)
        code, out, err = p.returncode, p.stdout or "", p.stderr or ""
    except subprocess.TimeoutExpired:
        code, out, err = 124, "", f"claude timed out after {LIMITS['max_task_minutes']} min"
    try:
        data = json.loads(out[out.index("{"):out.rindex("}") + 1])
    except ValueError:
        data = {"is_error": True, "result": tail(out + "\n" + err), "subtype": "unparsed"}
    out = out + "\n" + err
    usd = float(data.get("total_cost_usd") or 0.0)
    budget.charge(usd)
    text = str(data.get("result") or "")
    log(f"claude[{role}] done code={code} subtype={data.get('subtype')} turns={data.get('num_turns')} est=${usd:.2f}")
    if (data.get("is_error") or code != 0) and RATE_LIMIT.search(text + out[-2000:]):
        raise StopRun(f"Claude ติด usage/rate limit ({role})", "rate_limited")
    return {"ok": code == 0 and not data.get("is_error"), "text": text, "usd": usd,
            "subtype": data.get("subtype"), "turns": data.get("num_turns")}


# Read once at start: the maker edits this working tree, so it must not be able to rewrite the
# reviewer's or the visual reviewer's instructions during the run.
PROMPTS = {f.stem: f.read_text() for f in (HERE / "prompts").glob("*.md")}


def prompt(name: str, **values: Any) -> str:
    return PROMPTS[name].format(repo=REPO, base=BASE, **values)


# --------------------------------------------------------------------------- gates

@dataclass
class GateResult:
    name: str
    ok: bool
    detail: str = ""
    blocking_text: str = ""
    infra: bool = False  # the gate itself could not run: not the maker's problem


def changed_files() -> list[str]:
    return [f for f in git("diff", "--name-only", f"{base_sha()}...HEAD").splitlines() if f]


def changed_lines() -> int:
    total = 0
    for line in git("diff", "--numstat", f"{base_sha()}...HEAD").splitlines():
        a, d, *_ = line.split("\t")
        total += (int(a) if a.isdigit() else 0) + (int(d) if d.isdigit() else 0)
    return total


# Agent and loop configuration the maker must never change: the reviewer sessions would load it.
AGENT_CONFIG = (".claude/", "CLAUDE.md", "AGENTS.md", ".gitattributes", ".autopilot/", ".github/", ".mcp.json")


def agent_config_touched(files: list[str]) -> list[str]:
    return [f for f in files if f.startswith(AGENT_CONFIG)
            or Path(f).name in ("CLAUDE.md", "AGENTS.md", ".gitattributes", ".mcp.json") or "/.claude/" in f"/{f}"]


def command_gates() -> list[GateResult]:
    results = []
    touched = agent_config_touched(changed_files())
    if touched:
        log(f"gate agent-config: FAIL ({', '.join(touched[:5])})")
        return [GateResult("agent-config", False, ", ".join(touched),
                           "This task may not change agent or loop configuration (revert these files): " + ", ".join(touched))]
    for g in CONFIG["gates"]["commands"]:
        code, out = run(g["run"], timeout=900)
        results.append(GateResult(g["name"], code == 0, tail(out, 25), "" if code == 0 else f"`{g['run']}` failed:\n{tail(out, 40)}"))
        log(f"gate {g['name']}: {'pass' if code == 0 else 'FAIL'}")
    return results


def review_gate(task: Task, budget: Budget) -> GateResult:
    cfg = CONFIG["gates"]["review"]
    if not cfg["enabled"]:
        return GateResult("review", True, "disabled")
    instructions = prompt("reviewer", number=task.number, title=task.title, body=task.body, diff_path=review_diff())
    r = claude(instructions, budget=budget, max_turns=LIMITS["reviewer_max_turns"], tools=READ_ONLY_TOOLS, role="reviewer")
    return verdict_gate("claude-review", last_json(r["text"]) or {}, r["text"], cfg)


def review_diff() -> Path:
    """The branch diff and log, written by the loop for the read-only reviewer."""
    out = WORK / "review.diff"
    plain = ("-c", "core.attributesFile=/dev/null")  # attributes cannot hide or rewrite hunks
    out.write_text(git("log", "--no-color", "--format=%h %s", f"{base_sha()}..HEAD") + "\n\nChanged files:\n"
                   + git(*plain, "diff", "--name-status", f"{base_sha()}...HEAD") + "\n\n"
                   + git(*plain, "diff", "--no-color", "--no-ext-diff", "--no-textconv", "--text", f"{base_sha()}...HEAD"))
    return out


def verdict_gate(name: str, verdict: dict, raw: str, cfg: dict) -> GateResult:
    # Only P0/P1 block. A "request_changes" with P2/P3 only passes; those findings go into the evidence.
    # Fail closed: a missing verdict, malformed findings or an unknown severity blocks.
    findings = verdict.get("findings", [])
    known = {"P0", "P1", "P2", "P3"}
    if not isinstance(findings, list) or not all(isinstance(f, dict) for f in findings):
        findings, verdict = [], {}
    for f in findings:
        f["severity"] = str(f.get("severity", "")).strip().upper()
    blocking = [f for f in findings if f["severity"] in cfg["block_on"] or f["severity"] not in known]
    ok = verdict.get("verdict") in ("approve", "request_changes") and not blocking
    fmt = lambda fs: "\n".join(f"[{f.get('severity')}] {f.get('file')}:{f.get('line')} {f.get('summary')} → {f.get('fix')}" for f in fs)
    log(f"gate {name}: {verdict.get('verdict')} ({len(blocking)} blocking, {len(findings) - len(blocking)} non-blocking)")
    detail = f"{verdict.get('verdict', 'no verdict')}; {len(findings)} finding(s)\n{fmt(findings)}" if verdict else tail(raw, 60)
    return GateResult(name, ok, detail,
                      "" if ok else ("Reviewer findings to fix:\n" + fmt(blocking) if blocking else "Reviewer returned no parseable verdict."))


def needs_visual(task: Task, files: list[str]) -> bool:
    cfg = CONFIG["gates"]["visual"]
    return cfg["enabled"] and (bool(task.ui_pages) or any(f.startswith(tuple(cfg["trigger_paths"])) for f in files))


def skills_dir() -> Path | None:
    cfg = CONFIG["gates"]["visual"]
    if os.environ.get("AUTOPILOT_SKILLS_DIR"):
        return Path(os.environ["AUTOPILOT_SKILLS_DIR"])
    target = WORK / "platform-agent-skills"
    if not (target / "qa-testing/scripts/ui_review.mjs").exists():
        run(["git", "clone", "--quiet", f"https://github.com/{cfg['skills_repo']}.git", str(target)], timeout=300)
        run(["git", "checkout", "--quiet", cfg["skills_ref"]], cwd=target)
    return target if (target / "qa-testing/scripts/ui_review.mjs").exists() else None


def capture(src: Path, port: int, pages: list[str], out: Path) -> tuple[dict, str]:
    """Build and serve ``src`` on ``port``, capture ``pages``; return (counts, report_md path)."""
    skills = skills_dir()
    if not skills:
        raise RuntimeError("platform-agent-skills checkout not available")
    if src != ROOT:
        if not (src / "node_modules").exists():
            # its own install, not a symlink to ROOT's: Next 16/Turbopack will not resolve files
            # outside the workspace root, and the baseline must not share packages with the branch
            code, out_i = run("npm ci --no-audit --no-fund --prefer-offline", cwd=src, timeout=900)
            if code != 0:
                raise RuntimeError(f"baseline npm ci failed: {tail(out_i, 15)}")
        code, out_b = run("npm run build", cwd=src, timeout=900)
        if code != 0:
            raise RuntimeError(f"baseline build failed: {tail(out_b, 15)}")
    server = subprocess.Popen(["npx", "next", "start", "-p", str(port)], cwd=src, stdout=subprocess.DEVNULL,
                              stderr=subprocess.DEVNULL, start_new_session=True, env=code_env())
    try:
        for _ in range(60):
            if run(["curl", "-s", "-o", "/dev/null", f"http://127.0.0.1:{port}/"], timeout=10)[0] == 0:
                break
            time.sleep(1)
        cmd = ["node", str(skills / "qa-testing/scripts/ui_review.mjs"), "--widths", CONFIG["gates"]["visual"]["widths"],
               "--out", str(out), "--a11y", "off"]
        for p in pages:
            cmd += ["--url", f"http://127.0.0.1:{port}{p}"]
        code, txt = run(cmd, timeout=600)
        report = out / "report.json"
        if not report.exists():
            raise RuntimeError(f"ui_review produced no report: {tail(txt, 15)}")
        data = json.loads(report.read_text())
        if not data.get("pages"):
            raise RuntimeError(f"ui_review captured no pages (browser failed to start?) skipped={str(data.get('skipped'))[:300]} {tail(txt, 8)}")
        return data.get("counts", {}), str(out / "report.md")
    finally:
        os.killpg(server.pid, signal.SIGTERM)


def visual_gate(task: Task, budget: Budget, baseline: dict) -> tuple[GateResult, list[dict]]:
    cfg = CONFIG["gates"]["visual"]
    pages = task.ui_pages or cfg["pages"]
    try:
        if "counts" not in baseline:
            wt = WORK / "baseline"
            if wt.exists():
                run(["git", "worktree", "remove", "--force", str(wt)])
            git("worktree", "prune")  # a deleted baseline dir stays registered otherwise
            git("worktree", "add", "--force", "--detach", str(wt), BASE)
            baseline["counts"], baseline["md"] = capture(wt, cfg["port"] + 1, pages, WORK / "shots-base")
            baseline["shots"] = str(WORK / "shots-base")
        shots = WORK / f"shots-{task.number}"
        shutil.rmtree(shots, ignore_errors=True)
        counts, report_md = capture(ROOT, cfg["port"], pages, shots)
    except Exception as e:
        return GateResult("visual", False, str(e), f"Visual gate could not run: {e}", infra=True), []
    worse = [f"{sev}: {counts.get(sev, 0)} (was {baseline['counts'].get(sev, 0)} on {BASE})"
             for sev in cfg["block_on_new"] if counts.get(sev, 0) > baseline["counts"].get(sev, 0)]
    if worse:
        return GateResult("visual-audit", False, f"counts {counts}",
                          f"The automated visual audit got worse — read {report_md}:\n" + "\n".join(worse)), []
    if not cfg["ai_visual_review"]:
        return GateResult("visual-audit", True, f"counts {counts} (base {baseline['counts']})"), []
    checklist = skills_dir() / "qa-testing/references/ui-quality-gate.md"
    r = claude(prompt("visual", number=task.number, title=task.title, shots_dir=shots, baseline_shots_dir=baseline["shots"],
                      report_md=report_md, baseline_md=baseline["md"], checklist=checklist, widths=cfg["widths"]),
               budget=budget, max_turns=LIMITS["visual_max_turns"], tools=f"Read,Glob,Grep", role="visual")
    v = last_json(r["text"]) or {}
    bad = [f for f in v.get("findings", []) if f.get("severity") in ("blocker", "major")]
    ok = v.get("verdict") == "pass" and not bad
    text = "\n".join(f"[{f.get('severity')}] {f.get('page')} @{f.get('width')}: {f.get('summary')} → {f.get('fix')}" for f in bad)
    return (GateResult("visual-ai", ok, f"audit {counts}; AI verdict {v.get('verdict')}; checked {v.get('pages_checked')}",
                       "" if ok else "Visual reviewer findings to fix:\n" + (text or "no verdict returned")),
            v.get("preexisting", []))


# --------------------------------------------------------------------------- task loop

_BASE_SHA: list[str] = []


def base_sha() -> str:
    """The base commit this task started from, kept in memory: repo code can move local refs."""
    return _BASE_SHA[-1] if _BASE_SHA else BASE


def reset_to_base() -> None:
    if ARGS.sandbox:
        sha = git("rev-parse", BASE)
    elif PHASE in ("work", "merge-gate"):
        sha = PLAN["base_sha"]  # the commit the plan saw (this job's checkout); fetched anonymously if missing
        if run(["git", "cat-file", "-e", f"{sha}^{{commit}}"])[0] != 0:
            git("fetch", "--quiet", "origin", sha)
    else:
        git("fetch", "--quiet", "origin", f"+refs/heads/{BASE}:refs/autopilot/base")
        sha = git("rev-parse", "refs/autopilot/base")
    _BASE_SHA.append(sha)
    git("checkout", "--quiet", "--force", "-B", BASE, sha)
    git("clean", "-fdq", "-e", "node_modules")
    shutil.rmtree(ROOT / ".next", ignore_errors=True)  # no build cache carried between tasks


def touches_protected(files: list[str], task: Task) -> list[str]:
    allowed = {task.doc_path}
    return [f for f in files if f not in allowed and any(f.startswith(p) for p in CONFIG["merge"]["protected_paths"])]


def pr_approval() -> bool:
    """Merging to main deploys production here, so every change waits for the approval label."""
    return CONFIG["merge"]["mode"] == "pr-approval"


def deploy_note() -> str:
    return "Vercel Git จะ deploy production จาก main" if pr_approval() else "ยังไม่ได้ deploy production"


def vercel_free() -> int | None:
    """Free Vercel deployments left in the rolling 24 h (shared team quota), or None if unknown."""
    raw = os.environ.get("VERCEL_FREE_DEPLOYS", "").strip()
    return int(raw) if re.fullmatch(r"-?\d+", raw) else None


def approved_by_human(pr_number: int) -> str:
    """Login of the person who last added the approval label; "" if it was a bot or nobody."""
    events = gh_json("api", "--paginate", f"repos/{REPO}/issues/{pr_number}/events?per_page=100") or []
    who = [e.get("actor") or {} for e in events if e.get("event") == "labeled" and (e.get("label") or {}).get("name") == LABELS["approved"]]
    login = who[-1].get("login", "") if who else ""
    return login if login in CONFIG["merge"]["approvers"] and who[-1].get("type") != "Bot" else ""


def work_task(task: Task, budget: Budget, baseline: dict) -> dict:
    usd_before = budget.run_usd
    try:
        record = _work_task(task, budget, baseline)
        record["est_usd"] = round(budget.run_usd - usd_before, 3)
        return record
    except StopRun as e:
        issue_comment(task.number, f"⏸️ run หยุดกลางงานนี้ ({e.reason}) — คืนสถานะเป็น todo ให้ run ถัดไปเริ่มใหม่\n\n{run_url()}")
        set_status(task.number, "todo")
        budget.run_tasks.append({"issue": task.number, "title": task.title, "outcome": "interrupted", "reason": e.reason})
        raise


def _work_task(task: Task, budget: Budget, baseline: dict) -> dict:
    log(f"task #{task.number}: {task.title} (risk {task.risk})")
    record = {"issue": task.number, "title": task.title, "attempts": 0, "est_usd": 0.0, "outcome": "?"}
    set_status(task.number, "in_progress")
    reset_to_base()
    git("checkout", "--quiet", "-B", task.branch)
    feedback, last_fp, gates_log = "", None, []
    usd_before = budget.run_usd
    preexisting: list[dict] = []

    for attempt in range(1, LIMITS["max_attempts_per_task"] + 1):
        record["attempts"] = attempt
        if budget.run_usd - usd_before >= LIMITS["max_est_usd_per_task"]:
            return finish_blocked(task, record, f"ใช้ประมาณการเกิน ${LIMITS['max_est_usd_per_task']} ต่องาน", gates_log)
        maker = claude(prompt("maker", number=task.number, title=task.title, body=task.body, attempt=attempt,
                              max_attempts=LIMITS["max_attempts_per_task"], doc_path=task.doc_path,
                              feedback=("Fix these problems from the previous attempt's gates:\n" + feedback) if feedback else "First attempt."),
                       budget=budget, max_turns=LIMITS["maker_max_turns"], tools=MAKER_TOOLS, deny=MAKER_DENY, role="maker")
        verdict = last_json(maker["text"]) or {}
        if verdict.get("status") == "needs_human":
            return finish_needs_human(task, record, verdict.get("needs_human_reason") or "maker asked for a human")
        if verdict.get("status") == "cannot_do":
            return finish_blocked(task, record, f"maker: {verdict.get('summary', 'cannot do')}", gates_log)
        if not git("status", "--porcelain"):
            feedback = f"You made no file changes. Maker result: {maker.get('subtype')} — {tail(maker['text'], 10)}"
            fp = fingerprint(feedback)
        else:
            git("add", "-A")
            git("commit", "--quiet", "-m", f"autopilot(#{task.number}): {task.title} (attempt {attempt}){TRAILER}")
            gated = git("rev-parse", "HEAD")  # the commit the gates and reviewers judge; nothing else ships
            results = command_gates()
            if all(r.ok for r in results):
                results.append(review_gate(task, budget))
            files = changed_files()
            if all(r.ok for r in results) and needs_visual(task, files):
                g, preexisting = visual_gate(task, budget, baseline)
                results.append(g)
            gates_log.append({"attempt": attempt, "gates": {r.name: r.ok for r in results}})
            failed = [r for r in results if not r.ok]
            infra = [r for r in failed if r.infra]
            if infra:
                return finish_blocked(task, record, f"gate {infra[0].name} รันไม่ได้ (ปัญหาที่ระบบ ไม่ใช่โค้ด)", gates_log, infra[0].detail)
            if not failed:
                if git("rev-parse", "HEAD") != gated:
                    return finish_blocked(task, record, "HEAD เปลี่ยนระหว่าง gate (โค้ดใน repo สร้าง commit เอง) — ไม่ส่งต่อ", gates_log)
                git("reset", "--quiet", "--hard", gated)  # drop whatever the gates left in the tree
                git("clean", "-fdq", "-e", "node_modules")
                record["gated_sha"] = gated
                record["est_usd"] = round(budget.run_usd - usd_before, 3)  # shown in the evidence comment
                return finish_passed(task, record, verdict, results, files, preexisting)
            feedback = "\n\n".join(r.blocking_text for r in failed)
            fp = fingerprint(feedback)
        if fp == last_fp:
            return finish_blocked(task, record, "วนแก้ปัญหาเดิมซ้ำ (stuck)", gates_log, feedback)
        last_fp = fp
        log(f"attempt {attempt} failed: {feedback[:200]!r}")
    return finish_blocked(task, record, f"ไม่ผ่าน gate ภายใน {LIMITS['max_attempts_per_task']} รอบ", gates_log, feedback)


def gate_table(results: list[GateResult]) -> str:
    return "\n".join(f"| {r.name} | {'✅' if r.ok else '❌'} | {esc(r.detail.splitlines()[-1] if r.detail else '')[:120]} |" for r in results)


def record_gate_evidence(task: Task, results: list[GateResult]) -> None:
    doc = ROOT / task.doc_path
    if not doc.exists():
        return
    text = doc.read_text()
    review = "\n".join(f"- **{r.name}**: {'ผ่าน' if r.ok else 'ไม่ผ่าน'}\n" + textwrap.indent(r.detail.strip()[:2500], "  ")
                       for r in results if not r.name.startswith("visual")) + f"\n- Run: {run_url()} · {now_bkk():%Y-%m-%d %H:%M} ICT"
    visual = [r for r in results if r.name.startswith("visual")]
    visual_txt = ("\n".join(f"- **{r.name}**: {'ผ่าน' if r.ok else 'ไม่ผ่าน'} — {r.detail.strip()[:1500]}" for r in visual)
                  if visual else "N/A — งานนี้ไม่ได้แตะไฟล์ UI และ issue ไม่ได้ระบุ UI pages (loop ตรวจจาก diff)")
    for heading, body in (("Review evidence", review), ("Visual review", visual_txt)):
        text = re.sub(rf"(^##\s*{heading}[^\n]*\n)(.*?)(?=^##\s|\Z)", lambda m: m.group(1) + "\n" + body + "\n\n", text, count=1, flags=re.S | re.M)
    doc.write_text(text)
    if git("status", "--porcelain"):
        git("add", task.doc_path)
        git("commit", "--quiet", "-m", f"docs(autopilot): record gate evidence for #{task.number}{TRAILER}")


def finish_passed(task: Task, record: dict, verdict: dict, results: list[GateResult], files: list[str], preexisting: list[dict]) -> dict:
    record_gate_evidence(task, results)
    protected = touches_protected(files, task)
    lines = changed_lines()
    reasons = ["merge เข้า main = deploy production ผ่าน Vercel Git (W6: ทุกงานต้องอนุมัติ)"] if pr_approval() else []
    if protected:
        reasons.append("แตะไฟล์ที่ต้องให้คนอนุมัติ: " + ", ".join(protected[:6]))
    if task.risk not in CONFIG["merge"]["auto_merge_risk"]:
        reasons.append(f"risk {task.risk}")
    if lines > LIMITS["max_changed_lines_auto_merge"]:
        reasons.append(f"diff {lines} บรรทัด เกิน {LIMITS['max_changed_lines_auto_merge']}")
    if deferred() and not reasons:  # the work job cannot push the base branch: everything goes through a PR
        reasons.append("split jobs: merge ผ่าน PR เท่านั้น")
    acceptance = "\n".join(f"- [{'x' if a.get('met') else ' '}] {a.get('criterion')} — {a.get('evidence', '')}" for a in verdict.get("acceptance", []))
    evidence = (f"### Autopilot evidence ({now_bkk():%Y-%m-%d %H:%M} ICT)\n\n"
                f"- Run: {run_url()}\n- Attempts: {record['attempts']} · est. ${record['est_usd']}\n"
                f"- Diff: {lines} lines in {len(files)} files · task record `{task.doc_path}`\n\n"
                f"| Gate | Result | Detail |\n|---|---|---|\n{gate_table(results)}\n\n"
                f"**Acceptance (maker self-check, verified by reviewer):**\n{acceptance or '-'}\n\n"
                f"**Summary:** {verdict.get('summary', '')}").replace("Autopilot-Head:", "Autopilot-Head (quoted):")
    propose_preexisting(task, preexisting)

    if reasons:
        record["outcome"] = "pr_opened"
        head, gated = git("rev-parse", "HEAD"), record["gated_sha"]
        extra = [f for f in git("diff", "--name-only", gated, head).splitlines() if f]
        if head != gated and (git("rev-parse", f"{head}^") != gated or extra != [task.doc_path]):
            return finish_blocked(task, record, f"commit หลัง gate ไม่ใช่แค่ task record ({', '.join(extra[:5])}) — ไม่เปิด PR", [])
        if writes_allowed() and deferred():
            # work phase: publish pushes exactly this commit, opens the PR and posts the evidence
            emit("open_pr", issue=task.number, branch=task.branch, sha=head, evidence=evidence, reasons=reasons)
            record["pr"] = "(pending publish)"
            return record
        open_pr(task, head, evidence, reasons, record)
        return record

    if ARGS.sandbox:
        record["outcome"] = "sandbox_pass"
        log("sandbox: all gates passed; not merging\n" + evidence)
        telegram("task_done", f"🧪 #{task.number} {esc(task.title)} ผ่านทุก gate ใน sandbox (ไม่ได้ merge)")
        return record
    merged = merge_branch(task.branch, f"Merge {task.branch}: {task.title}\n\nCloses #{task.number}{TRAILER}")
    record["outcome"] = "merged" if merged else "merge_failed"
    record["commit"] = merged or None
    if merged:
        issue_comment(task.number, evidence + f"\n\n✅ merge เข้า `{BASE}` แล้ว ({merged[:7]}) · **{deploy_note()}**")
        if writes_allowed():
            gh("issue", "close", str(task.number), "--repo", REPO, "--reason", "completed", check=False)
            clear_status(task.number)
        telegram("task_done", f"✅ #{task.number} {esc(task.title)}\nmerge แล้ว {merged[:7]} · {record['attempts']} รอบ · ~${record['est_usd']}\n{task.url}")
    else:
        return finish_blocked(task, record, "merge/push เข้า main ไม่สำเร็จ", [])
    return record


def unquote_head(text: str) -> str:
    """Text from the maker/reviewers must not carry a line the approval check would read as the gated head."""
    return str(text).replace("Autopilot-Head:", "Autopilot-Head (quoted):")


def open_pr(task: Task, head: str, evidence: str, reasons: list[str], record: dict) -> None:
    """Push the gated commit to the task branch, open the PR and record it on the issue."""
    evidence, reasons = unquote_head(evidence), [unquote_head(r) for r in reasons]
    if writes_allowed():
        git("push", "--quiet", "--force", "origin", f"{head}:refs/heads/{task.branch}")
        pr = gh("pr", "create", "--repo", REPO, "--base", BASE, "--head", task.branch,
                "--title", f"autopilot(#{task.number}): {task.title}", "--body-file", "-",
                stdin=f"{evidence}\n\nต้องให้คนอนุมัติเพราะ: {'; '.join(reasons)}\n\n"
                      f"อนุมัติ: ใส่ label `{LABELS['approved']}` ที่ PR นี้ แล้ว run ถัดไปจะ merge ให้ (merge ใน clone ตามกติกา)"
                      + (f" เมื่อโควตา Vercel เหลือมากกว่า {CONFIG['merge']['min_free_vercel_deploys']} deploy" if pr_approval() else "")
                      + f"\n\nAutopilot-Head: {head} (gate ตรวจ commit นี้ ถ้ามี push ใหม่ label อนุมัติจะไม่มีผล)\n\nRefs #{task.number}\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)")
        record["pr"] = pr
        dispatch_ci(task.branch)  # the PR's own event starts no workflow (GITHUB_TOKEN)
    issue_comment(task.number, evidence + f"\n\n➡️ เปิด PR รออนุมัติ: {record.get('pr', '(sandbox)')}")
    set_status(task.number, "needs_human")
    telegram("pr_opened", f"🟡 #{task.number} {esc(task.title)}\nผ่านทุก gate แต่ต้องอนุมัติ: {esc('; '.join(reasons))}\nPR: {record.get('pr', '-')}\nใส่ label <code>{LABELS['approved']}</code> เพื่อให้ merge")


PROTECTED = re.compile(r"protected branch hook declined|GH006|required status check|Changes must be made through a pull request", re.I)
_PUSH_BLOCKED: list[str] = []  # set when branch protection refused the bot's push to the base branch


def merge_branch(branch: str, message: str) -> str:
    git("checkout", "--quiet", BASE)
    if writes_allowed():
        git("pull", "--quiet", "--ff-only", "origin", BASE)
    base_sha, head_sha = git("rev-parse", "HEAD"), git("rev-parse", branch)
    code, out = run(["git", "merge", "--no-ff", "-m", message, branch])
    if code != 0:
        run(["git", "merge", "--abort"])
        log(f"merge failed: {tail(out, 10)}")
        return ""
    merged_sha = git("rev-parse", "HEAD")
    if PHASE == "publish" and MERGE_GATES.get("preflight_ok") is not True:
        # no merge without npm test passing on main in the merge-gate job, even when the tree is the PR's
        log(f"merge of {branch}: no passing merge-gate preflight (npm test on main) — waits for the next run")
        _GATE_MISSING.append("preflight")
        git("reset", "--quiet", "--hard", "HEAD~1")
        return ""
    if git("rev-parse", f"{branch}^{{tree}}") != git("rev-parse", "HEAD^{tree}"):
        # main moved since the branch was cut: re-run the command gates on the merged tree. The
        # publish job runs no repo code, so it needs the work job's gate result for this exact tree.
        if PHASE == "publish":
            # publish runs no repo code: it needs the merge-gate job's result (a job output the
            # maker's job cannot write) for this exact merged tree and approved head
            tree, att = git("rev-parse", "HEAD^{tree}"), (MERGE_GATES.get("gates") or {}).get(branch) or {}
            same_head = att.get("head") == head_sha
            if not (same_head and tree in (att.get("ok_trees") or [])):
                if same_head and tree in (att.get("failed_trees") or []):
                    log(f"merge of {branch}: command gates failed on merged tree {tree[:7]}")  # a real failure
                else:
                    log(f"merge of {branch}: no merge-gate result for merged tree {tree[:7]} — waits for the next run")
                    _GATE_MISSING.append(tree)
                git("reset", "--quiet", "--hard", "HEAD~1")
                return ""
        elif not all(r.ok for r in command_gates()):
            git("reset", "--quiet", "--hard", "HEAD~1")
            return ""
    # Repo code may have run since the merge (the gates above): trust no local ref. Push exactly
    # the merge commit made here, and only if its parents are the remote base and the branch head.
    sha = merged_sha
    if writes_allowed():
        git("fetch", "--quiet", "origin", f"+refs/heads/{BASE}:refs/autopilot/base")
        remote_base = git("rev-parse", "refs/autopilot/base")
        parents = git("rev-list", "--parents", "-n", "1", sha).split()[1:]
        if parents != [remote_base, head_sha] or remote_base != base_sha:
            log(f"push refused: merge parents {parents} ≠ [{remote_base}, {head_sha}] (base at merge {base_sha})")
            git("reset", "--quiet", "--hard", "HEAD~1")
            return ""
        code, out = run(["git", "push", "--quiet", "origin", f"{sha}:refs/heads/{BASE}"])
        if code != 0:
            log(f"push failed: {tail(out, 10)}")
            if PROTECTED.search(out):
                _PUSH_BLOCKED.append(tail(out, 6))
            git("reset", "--quiet", "--hard", "HEAD~1")
            return ""
        run(["git", "push", "--quiet", "origin", "--delete", branch])
    return sha


def keep_work(task: Task, record: dict) -> str:
    """Commit leftovers and push the branch so a human can pick the work up."""
    if git("rev-parse", "--abbrev-ref", "HEAD") != task.branch:
        return ""
    if git("status", "--porcelain"):
        git("add", "-A")
        git("commit", "--quiet", "-m", f"autopilot(#{task.number}): unfinished work ({record['outcome']}){TRAILER}")
    if not git("log", "--oneline", f"{BASE}..HEAD"):
        return ""
    if writes_allowed():
        if deferred():
            emit("push_branch", issue=task.number, branch=task.branch, sha=git("rev-parse", "HEAD"))
        else:
            run(["git", "push", "--quiet", "--force-with-lease", "origin", task.branch])
        return f"\n- Branch ที่ทำค้างไว้: https://github.com/{REPO}/tree/{task.branch}"
    return f"\n- Branch (local): {task.branch}"


def finish_blocked(task: Task, record: dict, reason: str, gates_log: list, feedback: str = "") -> dict:
    record["outcome"] = "blocked"
    record["reason"] = reason
    branch_note = keep_work(task, record)
    body = (f"### ⛔ Autopilot หยุดงานนี้ ({now_bkk():%Y-%m-%d %H:%M} ICT)\n\nสาเหตุ: **{reason}**\n\n"
            f"- Run: {run_url()}\n- Attempts: {record['attempts']}\n- Gates: `{json.dumps(gates_log, ensure_ascii=False)}`{branch_note}\n\n"
            f"<details><summary>ปัญหาล่าสุด</summary>\n\n```\n{feedback[-3000:]}\n```\n</details>\n\n"
            f"ถ้าจะให้ลองใหม่: แก้ issue (ขยาย acceptance criteria หรือแตกงานเล็กลง) แล้วเปลี่ยน label กลับเป็น `{LABELS['todo']}`")
    issue_comment(task.number, body)
    set_status(task.number, "blocked")
    telegram("task_blocked", f"⛔ #{task.number} {esc(task.title)}\n{esc(reason)}\n{task.url}")
    return record


def finish_needs_human(task: Task, record: dict, reason: str) -> dict:
    record["outcome"] = "needs_human"
    record["reason"] = reason
    branch_note = keep_work(task, record)
    issue_comment(task.number, f"### 🙋 ต้องการคนตัดสินใจ\n\n{reason}\n{branch_note}\n\nตอบใน issue นี้ แล้วเปลี่ยน label กลับเป็น `{LABELS['todo']}`")
    set_status(task.number, "needs_human")
    telegram("needs_human", f"🙋 #{task.number} {esc(task.title)}\nต้องการคน: {esc(reason)}\n{task.url}")
    return record


# --------------------------------------------------------------------------- approvals / planner

# ------------------------------------------------------------------ CI on autopilot PRs
# A PR opened with GITHUB_TOKEN triggers no other workflow, so the loop dispatches the repo's CI
# workflow on the PR branch (workflow_dispatch is allowed for GITHUB_TOKEN; needs `actions: write`).
# The run's head_sha is the branch head, so its result belongs to the commit the gates checked.
CI_BAD = ("failure", "timed_out", "startup_failure")  # action_required = held for approval, not a result


def ci_verdict(runs: list[dict], sha: str) -> str:
    """success | failed | pending | missing, from the newest CI run for ``sha``."""
    mine = sorted((r for r in runs if r.get("head_sha") == sha), key=lambda r: r.get("run_number", 0))
    if not mine:
        return "missing"
    latest = mine[-1]
    if latest.get("status") != "completed":
        return "pending"
    if latest.get("conclusion") == "success":
        return "success"
    if latest.get("conclusion") in CI_BAD:
        return "failed"
    return "missing"  # cancelled/skipped/neutral/stale/action_required: says nothing about the code, run it again


def ci_runs(sha: str) -> list[dict]:
    data = gh_json("api", f"repos/{REPO}/actions/workflows/{CONFIG['merge']['ci_workflow']}/runs?head_sha={sha}&per_page=20") or {}
    return data.get("workflow_runs", []) if isinstance(data, dict) else []


_DISPATCHED: set[str] = set()


def dispatch_ci(branch: str) -> None:
    if branch in _DISPATCHED:  # once per run: CI cancels an in-progress run for the same ref
        return
    _DISPATCHED.add(branch)
    if deferred():
        emit("dispatch_ci", branch=branch)
    elif writes_allowed():
        gh("workflow", "run", CONFIG["merge"]["ci_workflow"], "--repo", REPO, "--ref", branch, check=False)
        log(f"CI dispatched on {branch}")
    else:
        log(f"(no write) would dispatch CI on {branch}")


def ensure_pr_ci() -> None:
    """Every open autopilot PR gets a CI run on its head, so the owner sees checks before approving."""
    prs = gh_json("pr", "list", "--repo", REPO, "--state", "open", "--json", "number,headRefName,headRefOid,isCrossRepository,author") or []
    for pr in prs:
        if (pr["headRefName"].startswith(CONFIG["branch_prefix"]) and not pr.get("isCrossRepository")
                and (pr.get("author") or {}).get("login") in CONFIG["backlog"]["pr_authors"]
                and ci_verdict(ci_runs(pr["headRefOid"]), pr["headRefOid"]) == "missing"):
            dispatch_ci(pr["headRefName"])


def pr_note(number: int, body: str, remove_label: bool = True) -> None:
    """Comment on an autopilot PR and (by default) take the approval label off."""
    if deferred():
        emit("pr_note", pr=number, body=body, remove_label=remove_label)
        return
    if writes_allowed():
        if remove_label:
            gh("pr", "edit", str(number), "--repo", REPO, "--remove-label", LABELS["approved"], check=False)
        gh("pr", "comment", str(number), "--repo", REPO, "--body-file", "-", check=False, stdin=body)


def merge_approved_prs(budget: Budget) -> None:
    prs = gh_json("pr", "list", "--repo", REPO, "--state", "open", "--label", LABELS["approved"],
                  "--json", "number,headRefName,headRefOid,title,url,body,isCrossRepository,author") or []
    # only PRs the loop opened from a branch in this repository (a fork can name a branch autopilot/…)
    prs = [pr for pr in prs if pr["headRefName"].startswith(CONFIG["branch_prefix"]) and not pr.get("isCrossRepository")
           and (pr.get("author") or {}).get("login") in CONFIG["backlog"]["pr_authors"]]
    free, keep = vercel_free(), CONFIG["merge"].get("min_free_vercel_deploys", 0)
    if pr_approval():
        log(f"vercel quota: free={free} in 24 h, keep ≥ {keep} · approved PRs waiting: {len(prs)}")
    postponed = []
    for pr in prs:
        if pr_approval():
            approver = approved_by_human(pr["number"])
            if not approver:
                log(f"approved PR #{pr['number']}: label not added by a person — skipped")
                continue
            heads = re.findall(r"^Autopilot-Head: ([0-9a-f]{40}) ", pr["body"] or "", re.M)
            if not heads or heads[-1] != pr["headRefOid"]:
                log(f"approved PR #{pr['number']}: head {pr['headRefOid'][:7]} is not the commit the gates checked — label removed")
                pr_note(pr["number"], "มี commit ใหม่หลังจากที่ gate ตรวจ (หรือไม่มี `Autopilot-Head`) จึงถอด label อนุมัติออก · ตรวจ diff ใหม่ "
                        "แล้วปิด PR นี้และเปลี่ยน issue กลับเป็น `autopilot:todo` เพื่อให้ loop ทำและตรวจใหม่")
                continue
            ci = ci_verdict(ci_runs(pr["headRefOid"]), pr["headRefOid"])
            if ci in ("missing", "pending"):
                log(f"approved PR #{pr['number']}: CI {ci} on {pr['headRefOid'][:7]} — waiting for the next run")
                if ci == "missing":
                    dispatch_ci(pr["headRefName"])
                budget.run_tasks.append({"issue": None, "title": pr["title"], "outcome": "waiting_ci", "pr": pr["url"]})
                continue
            if ci == "failed":
                log(f"approved PR #{pr['number']}: CI failed on {pr['headRefOid'][:7]} — label removed, not merging")
                budget.run_tasks.append({"issue": None, "title": pr["title"], "outcome": "ci_failed", "pr": pr["url"]})
                pr_note(pr["number"], f"CI (`{CONFIG['merge']['ci_workflow']}`) ไม่ผ่านบน `{pr['headRefOid'][:7]}` จึงถอด label อนุมัติออกและไม่ merge · "
                        "ดู log ของ CI แล้วปิด PR นี้และเปลี่ยน issue กลับเป็น `autopilot:todo` ให้ loop ทำใหม่")
                telegram("task_blocked", f"⛔ CI ไม่ผ่านบน PR ที่อนุมัติ: {esc(pr['title'])} → ถอด label ไม่ merge\n{pr['url']}")
                continue
            if PHASE != "plan" and (free is None or free - 1 < keep):
                postponed.append(pr)
                budget.run_tasks.append({"issue": None, "title": pr["title"], "outcome": "postponed_quota", "pr": pr["url"]})
                continue
        if ARGS.dry_run:
            log(f"would merge approved PR #{pr['number']} {pr['title']}")
            continue
        if PHASE == "plan":
            # candidate for the merge-gate job; publish re-checks approval, head, CI and quota before merging
            MERGE_QUEUE.append({k: pr[k] for k in ("number", "headRefName", "headRefOid", "title", "url")})
            continue
        if merge_one(pr, budget) and free is not None:
            free -= 1
    for pr in postponed:
        log(f"approved PR #{pr['number']}: postponed (Vercel free={free}, keep ≥ {keep})")
    if postponed:
        telegram("budget_hit", f"⏳ เลื่อน merge PR ที่อนุมัติแล้ว {len(postponed)} อัน: โควตา Vercel เหลือ {free if free is not None else 'ไม่ทราบ'} "
                 f"(ต้องเหลือมากกว่า {keep}) · run ถัดไปจะลองใหม่\n" + "\n".join(pr["url"] for pr in postponed))


def merge_one(pr: dict, budget: Budget) -> str:
    """Merge one approved PR in this clone and push the merge commit; "" if it did not land."""
    log(f"approved PR #{pr['number']}: merging")
    reset_to_base()
    git("fetch", "--quiet", "origin", pr["headRefName"])
    git("checkout", "--quiet", "-B", pr["headRefName"], f"origin/{pr['headRefName']}")
    if pr_approval() and git("rev-parse", "HEAD") != pr["headRefOid"]:
        log(f"approved PR #{pr['number']}: fetched head is not the approved commit — skipped")
        return ""
    # the issue number comes from the branch the loop named (autopilot/<N>-…), not from the editable body
    issue = re.match(re.escape(CONFIG["branch_prefix"]) + r"(\d+)-", pr["headRefName"])
    msg = f"Merge {pr['headRefName']}: {pr['title']}\n\nApproved via label on {pr['url']}" + (f"\nCloses #{issue.group(1)}" if issue else "") + TRAILER
    _PUSH_BLOCKED.clear()
    _GATE_MISSING.clear()
    sha = merge_branch(pr["headRefName"], msg)
    if not sha and _GATE_MISSING:
        # main moved and nobody has gated this merged tree yet: not a failure, the next run gates it
        budget.run_tasks.append({"issue": None, "title": pr["title"], "outcome": "waiting_gate", "pr": pr["url"]})
        return ""
    if not sha and _PUSH_BLOCKED:
        # Branch protection on the base branch refuses GITHUB_TOKEN: the owner merges this one.
        budget.run_tasks.append({"issue": None, "title": pr["title"], "outcome": "needs_owner_merge", "pr": pr["url"]})
        pr_note(pr["number"], f"อนุมัติแล้ว แต่ branch protection ของ `{BASE}` ไม่ให้ bot push (required checks) จึงต้องให้เจ้าของ merge ในเครื่อง:\n\n"
                f"```bash\ngit fetch origin {pr['headRefName']} && git checkout {BASE} && git pull --ff-only\n"
                f"git merge --no-ff origin/{pr['headRefName']}  # head ต้องเป็น {pr['headRefOid'][:7]}\ngit push origin {BASE}\n```\n\n"
                f"merge = deploy production (Vercel) · ตรวจโควตา Vercel ก่อน\n\n```\n{_PUSH_BLOCKED[0]}\n```")  # comment once, not every run
        telegram("needs_human", f"🔒 อนุมัติ {esc(pr['title'])} แล้ว แต่ branch protection ไม่ให้ bot merge → เจ้าของ merge เอง\n{pr['url']}")
        return ""
    rec = {"issue": int(issue.group(1)) if issue else None, "title": pr["title"], "outcome": "merged" if sha else "merge_failed", "pr": pr["url"]}
    budget.run_tasks.append(rec)
    if sha and writes_allowed():
        gh("pr", "comment", str(pr["number"]), "--repo", REPO, "--body", f"merge ใน clone แล้ว ({sha[:7]}) ตามที่อนุมัติ · {deploy_note()}", check=False)
        gh("pr", "close", str(pr["number"]), "--repo", REPO, check=False)
        if issue:
            gh("issue", "close", issue.group(1), "--repo", REPO, check=False)
        telegram("task_done", f"✅ merge PR ที่อนุมัติแล้ว: {esc(pr['title'])} ({sha[:7]})")
    elif not sha:
        telegram("task_blocked", f"⛔ merge PR ที่อนุมัติไม่สำเร็จ (conflict หรือ gate ไม่ผ่านหลัง rebase): {pr['url']}")
    return sha


def create_task_issue(p: dict, origin: str) -> str:
    risk = p.get("risk", "medium")
    status = "todo" if risk in CONFIG["planner"]["auto_accept_risk"] else "proposed"
    body = (f"{p.get('why', '')}\n\n## Acceptance criteria\n" + "\n".join(f"- [ ] {a}" for a in p.get("acceptance", [])) +
            ("\n\n## UI pages\n" + "\n".join(f"- `{u}`" for u in p["ui_pages"]) if p.get("ui_pages") else "") +
            f"\n\n---\nสร้างโดย autopilot ({origin}). อนุมัติให้ทำ: เปลี่ยน label `{LABELS['proposed']}` เป็น `{LABELS['todo']}`")
    priority = p.get("priority") if p.get("priority") in CONFIG["backlog"]["priority_labels"] else "P2"  # never trust model labels
    labels = [CONFIG["backlog"]["label"], LABELS[status], priority, CONFIG["backlog"]["risk_labels"].get(risk, "risk:medium")]
    if not writes_allowed():
        log(f"(no write) propose: {p.get('title')}")
        return "(sandbox)"
    if deferred():
        emit("create_issue", proposal=p, origin=origin)
        return "(pending publish)"
    return gh("issue", "create", "--repo", REPO, "--title", p["title"][:120], "--body-file", "-",
              *sum((["--label", label] for label in labels), []), stdin=body)


def propose_preexisting(task: Task, items: list[dict]) -> None:
    serious = [i for i in items if i.get("severity") in ("blocker", "major")][:3]
    for i in serious:
        create_task_issue({"title": f"UI: {i.get('summary', '')[:90]}", "risk": "low", "priority": "P2",
                           "why": f"ปัญหาที่มีอยู่ก่อนแล้ว พบระหว่าง visual review ของ #{task.number} ({i.get('page')} @{i.get('width')}px)",
                           "acceptance": [f"Given หน้า {i.get('page')} ที่ {i.get('width')}px When เปิดดู Then ไม่พบปัญหา: {i.get('summary')}"],
                           "ui_pages": [i.get("page", "/")]}, "visual review")


def planner_context() -> dict | None:
    """What the planner reads from GitHub (plan phase); None when it should not run."""
    if not CONFIG["planner"]["enabled"] or list_tasks("proposed"):
        log("planner: skipped (disabled or proposals already waiting)")
        return None
    existing = gh_json("issue", "list", "--repo", REPO, "--state", "all", "-L", "60", "--label", CONFIG["backlog"]["label"], "--json", "number,title,state") or []
    signals: dict[int, str] = {}
    for label in SIGNAL_LABELS:
        for i in gh_json("issue", "list", "--repo", REPO, "--state", "open", "-L", "30", "--label", label, "--json", "number,title") or []:
            signals.setdefault(i["number"], f"- #{i['number']} [{label}] {i['title']}")
    return {"existing": existing, "signals": list(signals.values())}


def plan(budget: Budget, ctx: dict | None = None) -> None:
    ctx = ctx if ctx is not None else planner_context()
    if not ctx:
        return
    existing, signals = ctx["existing"], ctx["signals"]
    lint = run(CONFIG["planner"].get("context_command", "npm run lint"), timeout=600)[1]
    r = claude(prompt("planner", max=CONFIG["planner"]["max_proposals"], lint=tail(lint, 60),
                      existing="\n".join(f"- #{i['number']} [{i['state']}] {i['title']}" for i in existing) or "- none",
                      signals="\n".join(signals) or "- none"),
               budget=budget, max_turns=LIMITS["reviewer_max_turns"], tools=READ_ONLY_TOOLS, role="planner")
    proposals = (last_json(r["text"]) or {}).get("proposals", [])[: CONFIG["planner"]["max_proposals"]]
    urls = [create_task_issue(p, "planner") for p in proposals]
    if urls:
        telegram("proposals", "📝 backlog ว่าง เสนองานใหม่ {} งาน (รออนุมัติ):\n".format(len(urls)) +
                 "\n".join(f"• {esc(p['title'])}" for p in proposals) +
                 f"\nอนุมัติ: เปลี่ยน label เป็น <code>{LABELS['todo']}</code>\nhttps://github.com/{REPO}/issues?q=label%3A{urllib.parse.quote(LABELS['proposed'])}")


# --------------------------------------------------------------------------- main

def preflight() -> None:
    if not ARGS.sandbox and not ARGS.dry_run and git("status", "--porcelain"):
        raise StopRun("working tree ไม่สะอาดก่อนเริ่ม run")
    if not ARGS.dry_run and PHASE != "merge-gate" and not shutil.which("claude"):
        raise StopRun("ไม่พบ claude CLI")
    if writes_allowed():
        if PHASE not in ("work", "merge-gate"):
            git("fetch", "--quiet", "origin", BASE)
        reset_to_base()
        code, out = run("npm test", timeout=600)
        if code != 0:
            raise StopRun(f"main พังอยู่แล้ว (npm test fail) — ไม่เริ่มงานใหม่:\n{tail(out, 8)}", "paused")


def not_dumpable() -> None:
    """Repo code runs as the same user; PR_SET_DUMPABLE=0 stops it reading this process's
    /proc/<pid>/environ (GH_TOKEN) or memory. Linux only; elsewhere a no-op."""
    try:
        import ctypes
        ctypes.CDLL(None, use_errno=True).prctl(4, 0, 0, 0, 0)  # PR_SET_DUMPABLE = 4
    except (OSError, AttributeError):
        pass


def consecutive_failures(budget: Budget) -> int:
    fails = 0
    for o in budget.recent_outcomes:
        if o in ("interrupted", "pr_opened", "needs_human", "postponed_quota", "needs_owner_merge", "waiting_ci", "ci_failed", "waiting_gate"):
            continue
        if o not in ("blocked", "merge_failed"):
            break
        fails += 1
    return fails


def task_loop(budget: Budget, ready_fn, planner_fn) -> str:
    """Work through ready tasks until a run limit; returns the stop reason."""
    baseline: dict = {}
    done, seen = 0, set()
    while done < ARGS.max_tasks:
        budget.check()
        ready = [t for t in ready_fn() if t.number not in seen]
        if not ready:
            if done == 0 and not ARGS.dry_run:
                planner_fn()
            elif ARGS.dry_run:
                log("would run the planner (backlog empty)")
            return "backlog ว่าง" if done == 0 else "ไม่มีงานพร้อมทำแล้ว"
        task = ready[0]
        seen.add(task.number)
        if ARGS.dry_run:
            log(f"would work on #{task.number} {task.title} (P{task.priority}, risk {task.risk}, ui {task.ui_pages}, branch {task.branch})")
            return "dry-run"
        budget.run_tasks.append(work_task(task, budget, baseline))
        done += 1
        if counts_as_task(budget.run_tasks[-1]):
            budget.tasks_today += 1
            if budget.tasks_today >= LIMITS["max_tasks_per_day"]:
                return "ครบเพดานงานต่อวัน"
    return f"ครบ {ARGS.max_tasks} งานต่อ run"


def run_summary(budget: Budget, stop_reason: str, minutes: float) -> None:
    if budget.run_tasks or CONFIG["notify"]["run_summary"] == "always":
        merged = [t for t in budget.run_tasks if t.get("outcome") == "merged"]
        telegram("run_summary", f"📊 จบ run: {esc(stop_reason)}\nmerge {len(merged)}/{len(budget.run_tasks)} งาน · Claude {budget.run_calls} ครั้ง · ~${budget.run_usd:.2f} · {minutes:.0f} นาที\n"
                 f"วันนี้: {budget.calls_today}/{LIMITS['max_claude_calls_per_day']} calls · ~${budget.usd_today:.2f}/{LIMITS['max_est_usd_per_day']}"
                 + (f"\n{deploy_note()} (deploy-smoke ตรวจหน้าจริงหลัง deploy)" if merged and pr_approval() else
                    "\nmain นำหน้า production อยู่ — deploy ต้องให้คุณอนุมัติ" if merged else ""))


# --------------------------------------------------------------------------- split jobs

PLAN_FILE, RESULT_FILE, BUNDLE_FILE = "plan.json", "result.json", "work.bundle"
BUDGET_KEYS = ("calls_today", "tasks_today", "usd_today", "ledger_issue", "paused")


def budget_from(data: dict) -> Budget:
    b = Budget(**{k: data[k] for k in BUDGET_KEYS if k in data})
    b.run_tasks = list(data.get("run_tasks", []))
    return b


def write_output(**values: Any) -> None:
    path = os.environ.get("GITHUB_OUTPUT")
    if path:
        with open(path, "a") as f:
            for k, v in values.items():
                f.write(f"{k}={v}\n")


def remote_tip(branch: str) -> str:
    """The branch head on origin now ("" if it does not exist): publish pushes with this lease."""
    out = run(["git", "ls-remote", "origin", f"refs/heads/{branch}"])[1].split()
    return out[0] if out and re.fullmatch(r"[0-9a-f]{40}", out[0]) else ""


def phase_plan() -> int:
    """Read GitHub (read-only token) and decide what the run will do. Runs no repo code."""
    out: dict[str, Any] = {"kind": "autopilot-plan", "version": 2, "run_url": run_url(), "dry_run": ARGS.dry_run,
                           "max_tasks": ARGS.max_tasks, "skip": False, "stop": None, "error": None, "base_sha": "",
                           "ready": [], "branch_tips": {}, "planner": None}
    budget = Budget()
    try:
        if paused_issue():
            log("paused: open 'Autopilot paused' issue exists")
            out["skip"] = True
        else:
            budget = load_budget()
            fails = consecutive_failures(budget)
            if fails >= LIMITS["consecutive_failures_to_pause"]:
                pause(f"งานล้มเหลวติดกัน {fails} งาน")
                budget.paused = True
                out["stop"] = {"reason": f"paused: {fails} consecutive failures"}
            else:
                budget.check()
                if budget.tasks_today >= LIMITS["max_tasks_per_day"]:
                    raise StopRun(f"ครบ {LIMITS['max_tasks_per_day']} งาน/วันแล้ว", "run_summary")
                git("fetch", "--quiet", "origin", f"+refs/heads/{BASE}:refs/autopilot/base")
                out["base_sha"] = git("rev-parse", "refs/autopilot/base")
                # approved PRs that pass every check now: the merge-gate job gates their merged trees.
                # Notes and records come from publish, which re-checks everything on fresh state.
                mark = len(OUTBOX)
                merge_approved_prs(Budget())
                del OUTBOX[mark:]
                # only as many tasks as this run may work on: publish accepts writes for these issues only
                room = max(0, min(ARGS.max_tasks, LIMITS["max_tasks_per_day"] - budget.tasks_today))
                ready = [t for t in list_tasks("todo") if all(issue_closed(d) for d in t.depends_on)][:room]
                out["ready"] = [asdict(t) for t in ready]
                out["branch_tips"] = {t.branch: remote_tip(t.branch) for t in ready}
                if not ready and room and not ARGS.dry_run:
                    out["planner"] = planner_context()
    except StopRun as e:
        out["stop"] = {"reason": e.reason}
        log(f"stop: {e.reason}")
        if e.event == "paused":
            pause(e.reason)
        elif e.event != "run_summary":
            telegram(e.event, f"⚠️ {esc(e.reason)}")
    except Exception as e:  # recorded; publish writes the ledger and fails the workflow
        out["error"] = f"error: {type(e).__name__}: {e}"
        log(out["error"])
        telegram("run_error", f"💥 run error (plan): {esc(str(e))[:500]}\n{run_url()}")
    out["budget"] = asdict(budget)
    out["merges"] = MERGE_QUEUE
    out["intents"] = OUTBOX
    go = not out["skip"] and not out["stop"] and not out["error"]
    out["work"] = bool(go and (out["ready"] or out["planner"] or ARGS.dry_run))
    out["merge_gate"] = bool(go and out["merges"] and not ARGS.dry_run)
    raw = json.dumps(out, ensure_ascii=False, indent=1).encode()
    ARGS.state_dir.mkdir(parents=True, exist_ok=True)
    (ARGS.state_dir / PLAN_FILE).write_bytes(raw)
    digest = hashlib.sha256(raw).hexdigest()
    write_output(plan_sha256=digest, work=str(out["work"]).lower(), merge_gate=str(out["merge_gate"]).lower(),
                 base_sha=out["base_sha"], skip=str(out["skip"]).lower())
    log(f"plan: work={out['work']} merge_gate={out['merge_gate']} ready={len(out['ready'])} merges={len(out['merges'])} "
        f"intents={len(OUTBOX)} sha256={digest[:12]}")
    return 0


def gate_merges(merges: list[dict]) -> dict[str, dict]:
    """Merge each approved PR onto the plan base, both on top of the earlier PRs (the order publish
    merges in) and alone, and run the command gates on every merged tree that differs from the branch."""
    reset_to_base()
    base = cum = git("rev-parse", "HEAD")
    gates: dict[str, dict] = {}
    for m in merges:
        branch, head = m["headRefName"], m["headRefOid"]
        run(["git", "fetch", "--quiet", "origin", f"+refs/heads/{branch}:refs/autopilot/pr"])
        if run(["git", "rev-parse", "--verify", "--quiet", "refs/autopilot/pr"])[1].strip() != head:
            log(f"merge gate {branch}: head moved — skipped")
            continue
        branch_tree, ok_trees, failed_trees, next_cum = git("rev-parse", f"{head}^{{tree}}"), [], [], cum
        for start in dict.fromkeys([cum, base]):
            git("checkout", "--quiet", "--force", "--detach", start)
            git("clean", "-fdq", "-e", "node_modules")
            shutil.rmtree(ROOT / ".next", ignore_errors=True)  # ignored build output (.next/types feeds typecheck)
            for f in ROOT.glob("*.tsbuildinfo"):
                f.unlink(missing_ok=True)
            code, _ = run(["git", "merge", "--no-ff", "-m", f"gate {branch}", head])
            if code != 0:
                run(["git", "merge", "--abort"])
                continue
            merged, tree = git("rev-parse", "HEAD"), git("rev-parse", "HEAD^{tree}")
            if tree == branch_tree or all(r.ok for r in command_gates()):
                ok_trees.append(tree)
                if start == cum:
                    next_cum = merged
            else:
                failed_trees.append(tree)
        gates[branch] = {"head": head, "ok_trees": ok_trees, "failed_trees": failed_trees}
        cum = next_cum
        log(f"merge gate {branch}: {len(ok_trees)} passing tree(s)")
    reset_to_base()
    return gates


def phase_merge_gate() -> int:
    """No token, no model: npm test on main, then the command gates on the merged trees of the
    approved PRs (code a person approved). The result leaves as a job output, which no other job can
    overwrite (artifacts can be, by the work job's runtime token)."""
    load_plan(ARGS.plan_sha256)
    result: dict[str, Any] = {"preflight_ok": False, "gates": {}}
    try:
        if PLAN.get("merge_gate"):
            preflight()
            result["preflight_ok"] = True
            result["gates"] = gate_merges(PLAN.get("merges", []))
    except StopRun as e:
        log(f"merge gate stopped: {e.reason}")
    except Exception as e:
        log(f"merge gate error: {type(e).__name__}: {e}")
    write_output(merge_gates=json.dumps(result, separators=(",", ":")))
    log(f"merge gate: {json.dumps(result)[:300]}")
    return 0


def write_bundle(result: dict) -> None:
    """The commits publish may push, as a bundle on top of the plan base."""
    shas = sorted({i["sha"] for i in OUTBOX if i["kind"] in ("push_branch", "open_pr") and i["sha"] != PLAN["base_sha"]})
    refs = []
    for n, sha in enumerate(shas):
        git("update-ref", f"refs/autopilot/out/{n}", sha)
        refs.append(f"refs/autopilot/out/{n}")
    if refs:
        git("bundle", "create", str(ARGS.state_dir / BUNDLE_FILE), *refs, f"^{PLAN['base_sha']}")
    result["bundle"] = dict(zip(refs, shas))


def load_plan(expected_sha256: str | None) -> None:
    raw = (ARGS.state_dir / PLAN_FILE).read_bytes()
    if expected_sha256 is not None and hashlib.sha256(raw).hexdigest() != expected_sha256:
        raise SystemExit("plan.json does not match the plan job's sha256 output — refusing to use it")
    PLAN.clear()
    PLAN.update(json.loads(raw))
    ARGS.dry_run = ARGS.dry_run or bool(PLAN.get("dry_run"))
    ARGS.max_tasks = min(ARGS.max_tasks, int(PLAN.get("max_tasks") or ARGS.max_tasks))


def phase_work() -> int:
    """Run the maker, gates and reviewers with no GitHub token; GitHub writes become intents."""
    load_plan(ARGS.plan_sha256)
    budget = budget_from(PLAN["budget"])
    budget.run_tasks = []  # plan-phase records are the plan's; publish joins them
    result: dict[str, Any] = {"kind": "autopilot-result", "version": 2, "intents": OUTBOX, "error": None}
    stop_reason = "ok"
    try:
        if not PLAN.get("work"):
            stop_reason = "nothing to do"
        else:
            preflight()
            tasks = [Task(**t) for t in PLAN.get("ready", [])]
            ctx = PLAN.get("planner")
            stop_reason = task_loop(budget, lambda: tasks, lambda: plan(budget, ctx) if ctx else log("planner: skipped (plan)"))
    except StopRun as e:
        stop_reason = e.reason
        log(f"stop: {e.reason}")
        if e.event == "paused":
            pause(e.reason)
        elif e.event != "run_summary":
            telegram(e.event, f"⚠️ {esc(e.reason)}")
    except Exception as e:
        stop_reason = result["error"] = f"error: {type(e).__name__}: {e}"
        log(stop_reason)
        telegram("run_error", f"💥 run error: {esc(str(e))[:500]}\n{run_url()}")
    result["ledger"] = {"claude_calls": budget.run_calls, "est_usd": round(budget.run_usd, 3),
                        "minutes": round(minutes_used(), 1), "tasks": budget.run_tasks, "stop_reason": stop_reason}
    if not ARGS.dry_run and PLAN.get("base_sha"):
        try:
            write_bundle(result)
        except StopRun as e:  # e.g. git config changed by repo code: no bundle, but usage and the pause still go out
            result["error"] = f"bundle: {e.reason}"
            if e.event == "paused":
                pause(e.reason)
        except Exception as e:
            result["error"] = f"bundle: {type(e).__name__}: {e}"
    ARGS.state_dir.mkdir(parents=True, exist_ok=True)
    (ARGS.state_dir / RESULT_FILE).write_text(json.dumps(result, ensure_ascii=False, indent=1))
    log(f"work done: {stop_reason} · intents {len(OUTBOX)}")
    return 0


UNTRUSTED_KINDS = ("comment", "status", "telegram", "pause", "push_branch", "open_pr", "create_issue")
MAX_INTENTS = 200


def is_text(v: Any, limit: int) -> bool:
    return isinstance(v, str) and len(v) <= limit


def check_intent(i: Any, tasks: dict[int, Task], seen: dict[str, int]) -> str:
    """Why a work-job intent is refused ("" = allowed). The work job ran model output: trust nothing."""
    if not isinstance(i, dict) or i.get("kind") not in UNTRUSTED_KINDS:
        return "unknown kind"
    kind = i["kind"]
    seen[kind] = seen.get(kind, 0) + 1
    issue = i.get("issue")
    if kind in ("comment", "status", "push_branch", "open_pr") and (type(issue) is not int or issue not in tasks):
        return f"issue {issue!r} is not a task the plan gave this run"
    if kind == "comment":
        return "" if is_text(i.get("body"), 60000) else "bad body"
    if kind == "status":
        return "" if i.get("status") in ("todo", "in_progress", "blocked", "needs_human") else "bad status"
    if kind == "telegram":
        if seen[kind] > 30:
            return "too many notifications"
        return "" if i.get("event") in CONFIG["notify"]["events"] + ["run_summary"] and is_text(i.get("text"), 4000) else "bad telegram"
    if kind == "pause":
        return "" if is_text(i.get("reason"), 2000) else "bad reason"
    if kind == "create_issue":
        p = i.get("proposal")
        if seen[kind] > CONFIG["planner"]["max_proposals"] + 3 * len(tasks):  # planner + ≤3 visual-review issues per task
            return "too many proposals"
        ok = (isinstance(p, dict) and is_text(p.get("title"), 300) and is_text(p.get("why", ""), 8000)
              and isinstance(p.get("acceptance", []), list) and all(is_text(a, 1000) for a in p.get("acceptance", []))
              and isinstance(p.get("ui_pages", []), list) and all(is_text(u, 200) for u in p.get("ui_pages", []))
              and i.get("origin") in ("planner", "visual review"))
        return "" if ok else "bad proposal"
    # push_branch / open_pr: one push per task, to exactly its branch, of a commit from the verified bundle
    key = f"push:{issue}"
    if seen.get(key):
        return "second push for this task"
    if i.get("branch") != tasks[issue].branch:
        return f"branch {i.get('branch')!r} is not {tasks[issue].branch}"
    sha = i.get("sha")
    if not (isinstance(sha, str) and re.fullmatch(r"[0-9a-f]{40}", sha)):
        return "bad sha"
    if sha == PLAN["base_sha"] or sha not in BUNDLE_SHAS:
        return "commit not in the bundle"
    if run(["git", "merge-base", "--is-ancestor", PLAN["base_sha"], sha])[0] != 0:
        return "commit is not on top of the plan base"
    if kind == "open_pr" and not (is_text(i.get("evidence"), 30000) and isinstance(i.get("reasons"), list)
                                  and all(is_text(r, 500) for r in i["reasons"])):
        return "bad PR text"
    if kind == "open_pr":
        files = [f for f in git("diff", "--name-only", f"{PLAN['base_sha']}...{sha}").splitlines() if f]
        touched = [f for f in agent_config_touched(files) if f != tasks[issue].doc_path]
        if touched:
            return "changes agent/loop configuration: " + ", ".join(touched[:5])
    seen[key] = 1  # only an accepted push takes the task's one push
    return ""


def execute(i: dict, budget: Budget) -> None:
    kind = i["kind"]
    if kind == "comment":
        issue_comment(i["issue"], i["body"])
    elif kind == "status":
        clear_status(i["issue"]) if i["status"] == "clear" else set_status(i["issue"], i["status"])
    elif kind == "telegram":
        telegram(i["event"], i["text"])
    elif kind == "pause":
        pause(i["reason"])
    elif kind == "dispatch_ci":
        dispatch_ci(i["branch"])
    elif kind == "pr_note":
        pr_note(i["pr"], i["body"], i.get("remove_label", True))
    elif kind == "create_issue":
        create_task_issue(i["proposal"], i["origin"])
    elif kind == "push_branch":
        if writes_allowed():
            # lease on the tip the plan saw: a person's commits pushed meanwhile are never overwritten
            lease = (PLAN.get("branch_tips") or {}).get(i["branch"], "")
            git("push", "--quiet", f"--force-with-lease=refs/heads/{i['branch']}:{lease}", "origin",
                f"{i['sha']}:refs/heads/{i['branch']}")
    elif kind == "open_pr":
        t = next(Task(**t) for t in PLAN["ready"] if t["number"] == i["issue"])
        rec: dict = {}
        open_pr(t, i["sha"], i["evidence"], i["reasons"], rec)
        for r in budget.run_tasks:
            if r.get("issue") == t.number and r.get("pr") == "(pending publish)":
                r["pr"] = rec.get("pr", "(sandbox)")


def clean_task_record(t: Any) -> dict | None:
    if not isinstance(t, dict):
        return None
    keep = {k: v for k, v in t.items() if k in ("issue", "title", "attempts", "est_usd", "outcome", "reason", "pr", "gated_sha", "commit")
            and (v is None or isinstance(v, (int, float, str)))}
    return {k: (v[:500] if isinstance(v, str) else v) for k, v in keep.items()}


def import_bundle(errors: list[str]) -> None:
    bundle = ARGS.result_dir / BUNDLE_FILE if ARGS.result_dir else None
    if not (bundle and bundle.exists()):
        return
    if run(["git", "cat-file", "-e", f"{PLAN['base_sha']}^{{commit}}"])[0] != 0:
        git("fetch", "--quiet", "origin", PLAN["base_sha"])  # the bundle's prerequisite (main may be newer than this checkout)
    if run(["git", "bundle", "verify", "--quiet", str(bundle)])[0] != 0:
        errors.append("work bundle does not verify")
        return
    git("fetch", "--quiet", "--no-tags", str(bundle), "+refs/autopilot/out/*:refs/autopilot/in/*")
    for line in git("for-each-ref", "--format=%(objectname)", "refs/autopilot/in/").splitlines():
        BUNDLE_SHAS.add(line.strip())


def phase_publish() -> int:
    """The only job with a GitHub write token. Runs no repo code: re-checks approvals, CI and quota,
    checks the work job's intents and pushes exactly the gated commits from its bundle."""
    load_plan(ARGS.plan_sha256)
    if PLAN.get("skip"):
        log("paused: nothing to publish")
        return 0
    if ARGS.merge_gates:
        try:
            MERGE_GATES.update(json.loads(ARGS.merge_gates))
        except ValueError:
            log("merge gate output unreadable — approved merges wait")
    budget = budget_from(PLAN["budget"])
    errors = [PLAN["error"]] if PLAN.get("error") else []
    state = {"stop_reason": (PLAN.get("stop") or {}).get("reason") or "", "minutes": 0.0}

    def step(name: str, fn, *a) -> None:  # one failed write must not lose the ledger entry
        try:
            fn(*a)
        except StopRun as e:
            errors.append(f"{name}: {e.reason}")
            if e.event == "paused":
                pause(e.reason)
        except Exception as e:
            log(f"publish step {name} failed: {type(e).__name__}: {e}")
            errors.append(f"{name}: {type(e).__name__}: {str(e)[:200]}")

    result = read_result(errors)
    if result:
        step("usage", account_work, result, budget, state, errors)  # first, so the ledger has it whatever fails next
    step("labels", ensure_labels)
    if budget.ledger_issue is None and writes_allowed():
        step("ledger issue", lambda: setattr(budget, "ledger_issue", create_ledger_issue()))
    for i in PLAN.get("intents", []):  # the plan job's own decisions (trusted: it ran no repo code)
        step(f"plan {i.get('kind')}", execute, i, budget)
    if not (PLAN.get("stop") or PLAN.get("error")):
        step("pr ci", ensure_pr_ci)
        step("approved merges", merge_approved_prs, budget)  # fresh approval, head, CI and Vercel count
    if result:
        step("bundle", import_bundle, errors)
        intents = result.get("intents") if isinstance(result.get("intents"), list) else []
        tasks = {t["number"]: Task(**t) for t in PLAN.get("ready", [])}
        live: dict[int, bool] = {}
        seen: dict[str, int] = {}
        for n, i in enumerate(intents):
            why = "too many intents" if n >= MAX_INTENTS else check_intent(i, tasks, seen)
            issue = i.get("issue") if isinstance(i, dict) else None
            if not why and issue in tasks:
                if issue not in live:
                    live[issue] = still_approved(issue)
                if not live[issue]:
                    why = f"#{issue} is no longer open with {LABELS['todo']}/{LABELS['in_progress']}"
            if why:
                log(f"intent refused ({why}): {str(i)[:200]}")
                errors.append(f"refused work intent: {why}")
                continue
            step(f"work {i['kind']}", execute, i, budget)
    stop_reason = state["stop_reason"]
    if errors:
        stop_reason = "; ".join(e for e in [stop_reason] + errors if e)[:900]
        step("notify", telegram, "run_error", f"💥 run error: {esc(stop_reason)[:500]}\n{run_url()}")
    if not ARGS.dry_run:
        step("ledger", write_ledger, budget, stop_reason or "ok", state["minutes"])
    step("summary", run_summary, budget, stop_reason or "ok", state["minutes"])
    log(f"publish done: {stop_reason or 'ok'}")
    return 1 if errors else 0


def still_approved(number: int) -> bool:
    """The owner can withdraw a task while the work job runs (close it, or take autopilot:todo off)."""
    try:
        data = gh_json("issue", "view", str(number), "--repo", REPO, "--json", "state,labels") or {}
    except Exception as e:
        log(f"#{number}: could not read the issue ({type(e).__name__}) — not publishing for it")
        return False
    labels = {x.get("name") for x in data.get("labels", [])}
    return data.get("state") == "OPEN" and CONFIG["backlog"]["label"] in labels and bool(labels & {LABELS["todo"], LABELS["in_progress"]})


def read_result(errors: list[str]) -> dict | None:
    rpath = ARGS.result_dir / RESULT_FILE if ARGS.result_dir else None
    result = None
    if rpath and rpath.exists():
        try:
            result = json.loads(rpath.read_text())
            if not isinstance(result, dict) or result.get("kind") != "autopilot-result":
                raise ValueError("not an autopilot result")
        except ValueError as e:
            errors.append(f"work result unreadable: {e}")
            result = None
    if PLAN.get("work") and result is None:
        errors.append("work job left no result (failed, timed out or cancelled)")
    return result


def account_work(result: dict, budget: Budget, state: dict, errors: list[str]) -> None:
    ledger = result.get("ledger") if isinstance(result.get("ledger"), dict) else {}
    calls, usd = ledger.get("claude_calls"), ledger.get("est_usd")
    sane = (type(calls) is int and 0 <= calls <= LIMITS["max_claude_calls_per_day"] * 2
            and isinstance(usd, (int, float)) and not isinstance(usd, bool) and math.isfinite(usd) and 0 <= usd <= LIMITS["max_est_usd_per_day"] * 2)
    if not sane:
        # unreadable usage: book the day's caps, so a broken or forged result cannot buy more calls
        errors.append(f"work usage unreadable (claude_calls={str(calls)[:40]}, est_usd={str(usd)[:40]})")
        calls, usd = LIMITS["max_claude_calls_per_day"], LIMITS["max_est_usd_per_day"]
    budget.run_calls = int(calls)
    budget.run_usd = float(usd)
    budget.calls_today += budget.run_calls
    budget.usd_today += budget.run_usd
    state["minutes"] = float(nonneg(ledger.get("minutes")))
    tasks = ledger.get("tasks") if isinstance(ledger.get("tasks"), list) else []
    budget.run_tasks += [r for r in map(clean_task_record, tasks) if r]
    if is_text(ledger.get("stop_reason"), 500):
        state["stop_reason"] = ledger["stop_reason"]
    if result.get("error"):
        errors.append(str(result["error"])[:500])


def main() -> int:
    global ARGS, BASE, PHASE
    not_dumpable()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--sandbox", action="store_true")
    ap.add_argument("--max-tasks", type=int, default=LIMITS["max_tasks_per_run"])
    ap.add_argument("--phase", choices=("all", "plan", "merge-gate", "work", "publish"), default="all")
    ap.add_argument("--state-dir", type=Path, default=WORK / "state", help="plan.json (plan writes; work reads; publish reads)")
    ap.add_argument("--result-dir", type=Path, help="publish: the work job's result.json and work.bundle (untrusted)")
    ap.add_argument("--plan-sha256", help="merge-gate/work/publish: the plan job's output; plan.json must match it")
    ap.add_argument("--merge-gates", help="publish: the merge-gate job's output (JSON)")
    ARGS = ap.parse_args()
    PHASE = ARGS.phase
    WORK.mkdir(parents=True, exist_ok=True)
    if PHASE != "all":
        if ARGS.sandbox:
            print("--sandbox runs only with --phase all", file=sys.stderr)
            return 2
        if PHASE != "plan" and not ARGS.plan_sha256:
            print(f"--phase {PHASE} needs --plan-sha256", file=sys.stderr)
            return 2
        return {"plan": phase_plan, "merge-gate": phase_merge_gate, "work": phase_work, "publish": phase_publish}[PHASE]()
    stop_reason, budget = "ok", Budget()
    start_branch = git("rev-parse", "--abbrev-ref", "HEAD") if ARGS.sandbox else None
    if ARGS.sandbox:
        BASE = start_branch  # branch from, diff against and review against the current branch
        if git("status", "--porcelain"):
            print("sandbox needs a clean working tree (commit first)", file=sys.stderr)
            return 2
    try:
        if paused_issue():
            log("paused: open 'Autopilot paused' issue exists")
            return 0
        ensure_labels()
        budget = load_budget()
        fails = consecutive_failures(budget)
        if fails >= LIMITS["consecutive_failures_to_pause"]:
            pause(f"งานล้มเหลวติดกัน {fails} งาน")
            budget.paused = True
            write_ledger(budget, f"paused: {fails} consecutive failures")
            return 0
        budget.check()
        if budget.tasks_today >= LIMITS["max_tasks_per_day"]:
            raise StopRun(f"ครบ {LIMITS['max_tasks_per_day']} งาน/วันแล้ว", "run_summary")
        preflight()
        ensure_pr_ci()
        merge_approved_prs(budget)
        stop_reason = task_loop(budget, lambda: [t for t in list_tasks("todo") if all(issue_closed(d) for d in t.depends_on)],
                                lambda: plan(budget))
    except StopRun as e:
        stop_reason = e.reason
        log(f"stop: {e.reason}")
        if e.event == "paused":
            pause(e.reason)
        elif e.event != "run_summary":
            telegram(e.event, f"⚠️ {esc(e.reason)}")
    except Exception as e:  # unexpected: record it, notify, exit non-zero
        stop_reason = f"error: {type(e).__name__}: {e}"
        log(stop_reason)
        telegram("run_error", f"💥 run error: {esc(str(e))[:500]}\n{run_url()}")
        write_ledger(budget, stop_reason)
        return 1
    finally:
        if start_branch:
            run(["git", "checkout", "--quiet", "--force", start_branch])
    if not ARGS.dry_run:
        write_ledger(budget, stop_reason)
    run_summary(budget, stop_reason, minutes_used())
    log(f"done: {stop_reason}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
