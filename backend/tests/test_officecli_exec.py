"""Tests for officecli host/docker execution."""
from __future__ import annotations

import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.runner.officecli_exec import (
    _translate_args_for_container,
    _use_docker_only,
    resolve_user_mount,
    run_officecli,
)


class OfficecliExecTests(unittest.TestCase):
    def test_resolve_user_mount_from_docx_path(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            user_dir = Path(tmp) / "users" / "abc123"
            docx = user_dir / "projects" / "job1" / "myproj" / "exports" / "out.docx"
            user_dir.mkdir(parents=True)
            mount = resolve_user_mount(docx)
            self.assertIsNotNone(mount)
            assert mount is not None
            self.assertEqual(mount[0], user_dir.resolve())
            self.assertEqual(mount[1], "/work")

    def test_translate_args_for_container(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            user_dir = Path(tmp) / "users" / "u1"
            user_dir.mkdir(parents=True)
            host_docx = user_dir / "projects" / "j1" / "proj" / "exports" / "a.docx"
            host_out = user_dir / "projects" / "j1" / "proj" / ".preview" / "page-1.png"
            host_docx.parent.mkdir(parents=True, exist_ok=True)
            host_out.parent.mkdir(parents=True, exist_ok=True)
            args = [
                "view",
                str(host_docx),
                "screenshot",
                "-o",
                str(host_out),
            ]
            translated = _translate_args_for_container(args, user_dir.resolve(), "/work")
            self.assertIn("/work/projects/j1/proj/exports/a.docx", translated)
            self.assertIn("/work/projects/j1/proj/.preview/page-1.png", translated)

    def test_run_officecli_uses_host_when_available(self) -> None:
        with patch("backend.runner.officecli_exec.shutil.which", return_value="/usr/bin/officecli"):
            with patch("backend.runner.officecli_exec._host_officecli_works", return_value=True):
                with patch("backend.runner.officecli_exec.subprocess.run") as run_mock:
                    run_mock.return_value = Mock(returncode=0, stdout="", stderr="")
                    result = run_officecli(["officecli", "view", "x.docx", "outline", "--json"])
        self.assertEqual(result.returncode, 0)
        cmd = run_mock.call_args[0][0]
        self.assertEqual(cmd[0], "/usr/bin/officecli")

    def test_run_officecli_falls_back_when_host_broken(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            user_dir = Path(tmp) / "users" / "u1"
            user_dir.mkdir(parents=True)
            docx = user_dir / "projects" / "j1" / "p" / "exports" / "a.docx"
            docx.parent.mkdir(parents=True, exist_ok=True)
            docx.write_bytes(b"PK")
            with patch("backend.runner.officecli_exec.shutil.which", return_value="/usr/bin/officecli"):
                with patch("backend.runner.officecli_exec._host_officecli_works", return_value=False):
                    with patch("backend.runner.officecli_exec.get_runtime_config") as cfg_mock:
                        cfg_mock.return_value.docker.image = "word-runner:test"
                        with patch("backend.runner.officecli_exec.subprocess.run") as run_mock:
                            run_mock.return_value = Mock(returncode=0, stdout="{}", stderr="")
                            result = run_officecli(
                                ["officecli", "view", str(docx), "outline", "--json"],
                            )
            self.assertEqual(result.returncode, 0)
            cmd = run_mock.call_args[0][0]
            self.assertEqual(cmd[0], "docker")

    def test_use_docker_only_env(self) -> None:
        with patch.dict("os.environ", {"OFFICECLI_USE_DOCKER": "1"}):
            self.assertTrue(_use_docker_only())

    def test_run_officecli_docker_fallback(self) -> None:
        import tempfile

        with tempfile.TemporaryDirectory() as tmp:
            user_dir = Path(tmp) / "users" / "u1"
            user_dir.mkdir(parents=True)
            docx = user_dir / "projects" / "j1" / "p" / "exports" / "a.docx"
            docx.parent.mkdir(parents=True, exist_ok=True)
            docx.write_bytes(b"PK")
            with patch("backend.runner.officecli_exec.shutil.which", return_value=None):
                with patch("backend.runner.officecli_exec.get_runtime_config") as cfg_mock:
                    cfg_mock.return_value.docker.image = "word-runner:test"
                    with patch("backend.runner.officecli_exec.subprocess.run") as run_mock:
                        run_mock.return_value = Mock(returncode=0, stdout="{}", stderr="")
                        result = run_officecli(
                            ["officecli", "view", str(docx), "outline", "--json"],
                            timeout=30,
                        )
            self.assertEqual(result.returncode, 0)
            cmd = run_mock.call_args[0][0]
            self.assertEqual(cmd[0], "docker")
            self.assertIn("--entrypoint", cmd)
            self.assertIn("officecli", cmd)
            self.assertIn("word-runner:test", cmd)
            joined = " ".join(cmd)
            self.assertIn("/work/projects/j1/p/exports/a.docx", joined)


if __name__ == "__main__":
    unittest.main()
