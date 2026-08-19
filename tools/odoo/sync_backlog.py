#!/usr/bin/env python3
"""Mirror BACKLOG.md into the Odoo "MadGigz App" project.

BACKLOG.md stays the single source of truth (see CLAUDE.md); this pushes a
readable view of it into Odoo Project. Safe to re-run: it matches tasks by
their `#<number>` prefix, updates in place, and never deletes anything.

    python3 tools/odoo/sync_backlog.py            # dry run, shows the plan
    python3 tools/odoo/sync_backlog.py --apply    # write to Odoo
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from odoo import OdooError, client  # noqa: E402

BACKLOG = HERE.parent.parent / "BACKLOG.md"
PROJECT_NAME = "MadGigz App"
MILESTONE = "Public launch"
MILESTONE_DEADLINE = "2026-08-31"

# Vir's call, 13 Aug 2026 — the must-land-before-public-launch set.
CRITICAL = {137, 95, 119, 122, 134, 111, 118, 115, 116, 129, 140, 110, 58, 97}

# BACKLOG.md encodes status in the Order column. Honour it — dropping these
# markers is what made the first sync file 40-odd shipped items as open work.
STATUS_STAGE = {
    "\u2705": "Done",                  # shipped
    "\u2705~": "Waiting on someone",   # fixed in code, awaiting device confirm
    "\U0001f7e1": "In progress",       # built, awaiting staging verify + migration
    "\u267b\ufe0f": "Backlog",        # recurring ops
}

SIZE_COLORS = {"XS": 4, "S": 10, "M": 3, "L": 2, "XL": 1}


def md_to_html(text: str) -> str:
    """Light markdown -> HTML so the Odoo description stays readable."""
    out = html.escape(text)
    out = re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", out)
    out = re.sub(r"`(.+?)`", r"<code>\1</code>", out)
    return out


def normalise_size(raw: str) -> str | None:
    m = re.search(r"\b(XS|XL|S|M|L)\b", raw or "")
    return m.group(1) if m else None


def parse_backlog() -> list[dict]:
    rows, seen = [], set()
    for line in BACKLOG.read_text().splitlines():
        if not line.startswith("|"):
            continue
        cells = [c.strip() for c in line.strip().strip("|").split("|")]
        if len(cells) < 6:
            continue
        order, num, item, work, blocked, size = cells[:6]
        if not re.fullmatch(r"\d+", num):
            continue
        n = int(num)
        if n in seen:
            continue
        seen.add(n)
        rows.append(
            {
                "num": n,
                "status": None if order.isdigit() else order,
                "order": int(order) if order.isdigit() else None,
                "title": re.sub(r"\*\*", "", item).strip(),
                "work": work,
                "blocked": blocked,
                "size": normalise_size(size),
                "critical": n in CRITICAL,
            }
        )
    rows.sort(key=lambda r: (r["order"] is None, r["order"] or 0, r["num"]))
    return rows


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--apply", action="store_true", help="write to Odoo (default: dry run)")
    args = ap.parse_args()
    apply = args.apply
    tag = "APPLY" if apply else "DRY RUN"

    odoo = client()
    odoo.connect()

    proj = odoo.search_read("project.project", [["name", "=", PROJECT_NAME]], ["name"], limit=1)
    if not proj:
        raise OdooError(f"No project named {PROJECT_NAME!r}.")
    pid = proj[0]["id"]

    items = parse_backlog()
    print(f"[{tag}] {len(items)} open items in BACKLOG.md -> project {PROJECT_NAME!r} (id {pid})\n")

    # --- project features -------------------------------------------------
    if apply:
        odoo.execute(
            "project.project", "write",
            [[pid], {"allow_milestones": True, "allow_task_dependencies": True}],
        )
    print("features   milestones + task dependencies -> on")

    # --- tags -------------------------------------------------------------
    wanted = {"launch-critical": 1} | {f"size {s}": c for s, c in SIZE_COLORS.items()}
    existing = {t["name"]: t["id"] for t in odoo.search_read("project.tags", [], ["name"])}
    tag_ids = {}
    for name, color in wanted.items():
        if name in existing:
            tag_ids[name] = existing[name]
        elif apply:
            tag_ids[name] = odoo.execute("project.tags", "create", [{"name": name, "color": color}])
            print(f"tag        + {name}")
        else:
            tag_ids[name] = None
            print(f"tag        + {name}")

    # --- milestone --------------------------------------------------------
    ms = odoo.search_read(
        "project.milestone", [["name", "=", MILESTONE], ["project_id", "=", pid]], ["name"], limit=1
    )
    if ms:
        ms_id = ms[0]["id"]
    elif apply:
        ms_id = odoo.execute(
            "project.milestone", "create",
            [{"name": MILESTONE, "project_id": pid, "deadline": MILESTONE_DEADLINE}],
        )
        print(f"milestone  + {MILESTONE} ({MILESTONE_DEADLINE})")
    else:
        ms_id = None
        print(f"milestone  + {MILESTONE} ({MILESTONE_DEADLINE})")

    # --- stages -----------------------------------------------------------
    stages = {
        s["name"]: s["id"]
        for s in odoo.search_read("project.task.type", [["project_ids", "in", [pid]]], ["name"])
    }
    backlog_stage = stages.get("Backlog")

    # --- tasks ------------------------------------------------------------
    tasks = odoo.search_read(
        "project.task", [["project_id", "=", pid]], ["name", "stage_id"]
    )
    by_num = {}
    for t in tasks:
        m = re.match(r"#(\d+)(?![a-zA-Z0-9])", t["name"].strip())
        if m:
            by_num[int(m.group(1))] = t

    created = updated = 0
    moved: dict[str, list[int]] = {}
    reopened: list[int] = []
    for it in items:
        n = it["num"]
        name = f"#{n} {it['title']}"
        desc = f"<p>{md_to_html(it['work'])}</p>"
        if it["blocked"] and it["blocked"] not in {"—", "-", ""}:
            desc += f"<p><b>Blocked on:</b> {md_to_html(it['blocked'])}</p>"
        desc += f'<p><i>Synced from BACKLOG.md — that file is the source of truth.</i></p>'

        tags = []
        if it["critical"]:
            tags.append(tag_ids["launch-critical"])
        if it["size"]:
            tags.append(tag_ids[f"size {it['size']}"])
        tags = [t for t in tags if t]

        vals = {
            "name": name,
            "description": desc,
            "priority": "2" if it["critical"] else "0",
            "sequence": (it["order"] or 90) * 10 + (n % 10),
            "tag_ids": [(6, 0, tags)],
        }
        if it["critical"]:
            vals["date_deadline"] = f"{MILESTONE_DEADLINE} 12:00:00"
            if ms_id:
                vals["milestone_id"] = ms_id

        # The status marker in the Order column is authoritative for the stage.
        target = STATUS_STAGE.get(it["status"]) if it["status"] else None
        stage_id = stages.get(target) if target else None
        if stage_id:
            vals["stage_id"] = stage_id
        if target == "Done":
            vals["state"] = "1_done"

        if n in by_num:
            tid = by_num[n]["id"]
            # An un-marked row is open. If the task is parked in Done from an
            # earlier sync, reopen it — otherwise leave manual moves alone.
            cur = by_num[n]["stage_id"]
            if target is None and cur and cur[1] == "Done":
                vals["stage_id"] = backlog_stage
                vals["state"] = "01_in_progress"
                reopened.append(n)
            if apply:
                odoo.execute("project.task", "write", [[tid], vals])
            updated += 1
            if target:
                moved.setdefault(target, []).append(n)
        else:
            vals["project_id"] = pid
            vals.setdefault("stage_id", backlog_stage)
            if apply:
                odoo.execute("project.task", "create", [vals])
            created += 1
            if target:
                moved.setdefault(target, []).append(n)

    # --- report leftovers, never touch them -------------------------------
    stray = [
        t for t in tasks
        if not re.match(r"#\d+(?![a-zA-Z0-9])", t["name"].strip())
        or int(re.match(r"#(\d+)", t["name"].strip()).group(1)) not in {i["num"] for i in items}
    ]

    print(f"\n[{tag}] created {created}, updated {updated}")
    if reopened:
        print(f"  -> reopened (no ✅ in BACKLOG.md) {len(reopened):>2}: "
              f"{', '.join('#' + str(x) for x in sorted(reopened))}")
    for stage_name, nums in sorted(moved.items()):
        print(f"  -> {stage_name:<20} {len(nums):>2}: {', '.join('#'+str(x) for x in sorted(nums))}")
    if stray:
        print("\nIn Odoo but not in BACKLOG.md (left untouched — likely shipped, or Odoo's sample task):")
        for t in stray:
            print(f"  id {t['id']:<4} {t['name'][:70]}")
    if not apply:
        print("\nNothing was written. Re-run with --apply.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except OdooError as exc:
        print(f"error: {exc}", file=sys.stderr)
        raise SystemExit(1)
