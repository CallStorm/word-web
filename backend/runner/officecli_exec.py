"""Run officecli on the host or via word-runner Docker image."""
from __future__ import annotations

import logging
import os
import shutil
import subprocess
from pathlib import Path

from backend.config import get_runtime_config

log = logging.getLogger("backend.runner.officecli_exec")

CONTAINER_MOUNT = "/work"
_HOST_PROBE_TIMEOUT = 10


def _use_docker_only() -> bool:
    return os.getenv("OFFICECLI_USE_DOCKER", "").strip().lower() in ("1", "true", "yes", "on")


def _host_officecli_works(host_bin: str) -> bool:
    """Return False when the binary exists but cannot run (e.g. GLIBCXX on CentOS 7)."""
    try:
        result = subprocess.run(
            [host_bin, "--version"],
            capture_output=True,
            text=True,
            timeout=_HOST_PROBE_TIMEOUT,
            check=False,
        )
    except (OSError, subprocess.TimeoutExpired) as exc:
        log.warning("host officecli probe failed (%s): %s", host_bin, exc)
        return False
    if result.returncode == 0:
        return True
    detail = (result.stderr or result.stdout or "").strip()
    log.warning("host officecli unusable (%s): %s", host_bin, detail[:240])
    return False


def resolve_user_mount(path: Path | str) -> tuple[Path, str] | None:
    """Return (user_dir, container_prefix) for data/users/<uid>/ mount."""
    try:
        resolved = Path(path).resolve()
    except (OSError, ValueError):
        return None

    parts = resolved.parts
    for i, part in enumerate(parts):
        if part == "users" and i + 1 < len(parts):
            user_dir = Path(*parts[: i + 2])
            if user_dir.is_dir():
                return user_dir, CONTAINER_MOUNT
    return None


def _translate_path_arg(arg: str, user_dir: Path, container_prefix: str) -> str:
    try:
        resolved = Path(arg).resolve()
    except (OSError, ValueError):
        return arg
    try:
        rel = resolved.relative_to(user_dir)
    except ValueError:
        return arg
    return f"{container_prefix}/{rel.as_posix()}"


def _translate_args_for_container(
    args: list[str],
    user_dir: Path,
    container_prefix: str,
) -> list[str]:
    out: list[str] = []
    skip_next = False
    for i, arg in enumerate(args):
        if skip_next:
            skip_next = False
            continue
        if arg in ("-o", "--output") and i + 1 < len(args):
            out.append(arg)
            out.append(_translate_path_arg(args[i + 1], user_dir, container_prefix))
            skip_next = True
            continue
        if arg.endswith((".docx", ".doc", ".html", ".png", ".json")) or (
            len(arg) > 2 and arg[1] == ":" and "\\" in arg
        ):
            translated = _translate_path_arg(arg, user_dir, container_prefix)
            if translated != arg:
                out.append(translated)
                continue
        try:
            p = Path(arg)
            if p.is_absolute() and p.suffix.lower() in (".docx", ".doc", ".html", ".png", ".json"):
                out.append(_translate_path_arg(arg, user_dir, container_prefix))
                continue
        except (OSError, ValueError):
            pass
        out.append(arg)
    return out


def _run_officecli_docker(args: list[str], *, timeout: int) -> subprocess.CompletedProcess[str]:
    path_arg = next(
        (a for a in args if isinstance(a, str) and a.endswith(".docx")),
        None,
    )
    if not path_arg and "-o" in args:
        idx = args.index("-o")
        if idx + 1 < len(args):
            path_arg = args[idx + 1]
    mount = resolve_user_mount(path_arg) if path_arg else None
    if mount is None:
        for a in args:
            mount = resolve_user_mount(a)
            if mount:
                break

    if mount is None:
        log.warning("officecli docker fallback: cannot resolve user mount for args: %s", args[:5])
        return subprocess.CompletedProcess(
            args=["officecli", *args],
            returncode=127,
            stdout="",
            stderr="officecli docker fallback: no mount path",
        )

    user_dir, container_prefix = mount
    cfg = get_runtime_config()
    cli_args = args[1:] if args and args[0] == "officecli" else args
    container_args = _translate_args_for_container(cli_args, user_dir, container_prefix)

    cmd = [
        "docker",
        "run",
        "--rm",
        "--entrypoint",
        "officecli",
        "-v",
        f"{user_dir}:{CONTAINER_MOUNT}",
        cfg.docker.image,
        *container_args,
    ]
    log.info("officecli docker fallback: %s", " ".join(cmd[-6:]))
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        timeout=timeout,
        check=False,
    )


def run_officecli(args: list[str], *, timeout: int = 120) -> subprocess.CompletedProcess[str]:
    """Execute officecli; fall back to word-runner container when host binary is missing or broken."""
    if not args:
        raise ValueError("run_officecli requires at least one argument")

    if _use_docker_only():
        return _run_officecli_docker(args, timeout=timeout)

    host_bin = shutil.which("officecli")
    if host_bin and _host_officecli_works(host_bin):
        cmd = [host_bin, *args[1:]] if args[0] == "officecli" else [host_bin, *args]
        return subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )

    if host_bin:
        log.info("falling back to docker for officecli (host binary broken or unavailable)")

    return _run_officecli_docker(args, timeout=timeout)


def officecli_available() -> bool:
    """True when host officecli works or docker fallback is possible."""
    if not _use_docker_only():
        host_bin = shutil.which("officecli")
        if host_bin and _host_officecli_works(host_bin):
            return True
    if shutil.which("docker") is None:
        return False
    try:
        r = subprocess.run(
            ["docker", "info"],
            capture_output=True,
            timeout=10,
            check=False,
        )
        return r.returncode == 0
    except (OSError, subprocess.TimeoutExpired):
        return False
