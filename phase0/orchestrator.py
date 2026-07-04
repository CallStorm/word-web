"""Phase 0 word-master orchestrator CLI shell."""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from backend.runner import find_docx, resolve_project_dir, resume_sync, run_sync


def _print_event(ev: dict) -> None:
    kind = ev.get("kind")
    if kind == "stage":
        print(f"[stage] {ev.get('stage')}", flush=True)
    elif kind == "agent_text":
        print(f"[agent] {ev.get('text', '')[:200]}", flush=True)
    elif kind == "error":
        print(f"[error] {ev.get('message')}", flush=True)


def main() -> int:
    ap = argparse.ArgumentParser(description="Phase 0 word-master orchestrator CLI")
    ap.add_argument("prompt", help="User prompt")
    ap.add_argument("--project-name", default="phase0_demo")
    ap.add_argument("--project-root", type=Path, required=True)
    ap.add_argument("--resume", default=None, help="Session id to resume")
    ap.add_argument("--confirm", default="确认，继续生成。")
    args = ap.parse_args()

    args.project_root.mkdir(parents=True, exist_ok=True)
    events: list[dict] = []

    def on_event(ev: dict) -> None:
        events.append(ev)
        _print_event(ev)

    if args.resume:
        final = resume_sync(
            args.resume, args.confirm, args.project_root, args.project_name, on_event
        )
    else:
        final = run_sync(
            args.prompt, args.project_name, args.project_root, on_event,
            job_id="phase0",
        )

    print(json.dumps({
        "status": final["status"],
        "docx_path": final["docx_path"],
        "project_dir": final["project_dir"],
    }, ensure_ascii=False, indent=2))

    if final["status"] == "done":
        print(f"✅ DONE — docx: {final['docx_path']}", flush=True)
        return 0
    print(f"❌ {final['status']}: {final.get('error_message')}", flush=True)
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
