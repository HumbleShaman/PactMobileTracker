"""Starts the PactMobileTracker collector on GitHub (workflow_dispatch).

Windows Task Scheduler runs this every 5 minutes through pythonw, so no console
window appears. GitHub's own cron for the workflow only fires every few hours,
so while this PC is on it acts as the reliable clock. GitHub stays the single
writer of the data branch; this only asks it to run. Uses the gh CLI login
already on this PC.

Log: %LOCALAPPDATA%\\PactMobileTracker\\trigger.log (last 500 lines).
"""

import datetime
import os
import subprocess

GH = r"C:\Program Files\GitHub CLI\gh.exe"
REPO = "HumbleShaman/PactMobileTracker"
LOG_DIR = os.path.join(os.environ.get("LOCALAPPDATA", "."), "PactMobileTracker")
LOG = os.path.join(LOG_DIR, "trigger.log")


def log(line):
    os.makedirs(LOG_DIR, exist_ok=True)
    try:
        with open(LOG, encoding="utf-8") as f:
            lines = f.readlines()[-499:]
    except FileNotFoundError:
        lines = []
    stamp = datetime.datetime.now().isoformat(timespec="seconds")
    lines.append(f"{stamp} {line}\n")
    with open(LOG, "w", encoding="utf-8") as f:
        f.writelines(lines)


try:
    r = subprocess.run(
        [GH, "workflow", "run", "collect.yml", "-R", REPO],
        capture_output=True,
        text=True,
        timeout=60,
        creationflags=subprocess.CREATE_NO_WINDOW,
    )
    log("ok" if r.returncode == 0 else f"failed ({r.returncode}): {(r.stderr or r.stdout).strip()[:300]}")
except Exception as e:  # network down, gh missing, timeout
    log(f"error: {e!r}"[:300])
