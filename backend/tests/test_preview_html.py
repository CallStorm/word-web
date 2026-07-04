"""Tests for document HTML preview generation."""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.runner.preview import (
    DOCUMENT_HTML_NAME,
    DOCUMENT_OUTLINE_NAME,
    check_figure_adjacency_warnings,
    find_document_html,
    find_document_outline,
    generate_docx_html,
    generate_docx_outline,
    load_document_outline,
)

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "preview_test"
FIXTURE_DOCX = FIXTURE_ROOT / "exports" / "test.docx"


class PreviewHtmlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.preview_dir = FIXTURE_ROOT / ".preview"
        self.html_path = self.preview_dir / DOCUMENT_HTML_NAME
        if self.html_path.is_file():
            self.html_path.unlink()

    def test_generate_docx_html_creates_file(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        ok = generate_docx_html(FIXTURE_ROOT, FIXTURE_DOCX)
        self.assertTrue(ok)
        self.assertTrue(self.html_path.is_file())
        self.assertGreater(self.html_path.stat().st_size, 100)
        content = self.html_path.read_text(encoding="utf-8")
        self.assertIn("data-path=", content)
        self.assertEqual(find_document_html(FIXTURE_ROOT), self.html_path)

    def test_generate_docx_outline_creates_file(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        outline_path = self.preview_dir / DOCUMENT_OUTLINE_NAME
        if outline_path.is_file():
            outline_path.unlink()
        ok = generate_docx_outline(FIXTURE_ROOT, FIXTURE_DOCX)
        self.assertTrue(ok)
        headings = load_document_outline(FIXTURE_ROOT)
        self.assertGreaterEqual(len(headings), 2)
        self.assertEqual(headings[0]["data_path"], "/body/p[1]")
        self.assertIn("text", headings[0])

    def test_generate_docx_html_skips_when_fresh(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        generate_docx_html(FIXTURE_ROOT, FIXTURE_DOCX)
        os.utime(self.html_path, None)
        mtime = self.html_path.stat().st_mtime
        ok = generate_docx_html(FIXTURE_ROOT, FIXTURE_DOCX)
        self.assertTrue(ok)
        self.assertEqual(self.html_path.stat().st_mtime, mtime)

    def test_check_figure_adjacency_warnings_on_fixture(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        warnings = check_figure_adjacency_warnings(FIXTURE_DOCX)
        self.assertIsInstance(warnings, list)

    def test_check_figure_adjacency_detects_misplaced_caption(self) -> None:
        lines = [
            "  [Heading3] 图2-1：AI数字人核心技术架构图",
            "  [Normal] 本章介绍核心技术。",
            "  [Normal] 更多正文。",
        ]
        with patch(
            "backend.runner.preview.subprocess.run",
            return_value=Mock(returncode=0, stdout="\n".join(lines)),
        ):
            warnings = check_figure_adjacency_warnings(FIXTURE_DOCX)
        self.assertEqual(len(warnings), 1)
        self.assertIn("图题与图片未相邻", warnings[0])

    def test_check_figure_adjacency_passes_when_image_follows(self) -> None:
        lines = [
            "  [Caption] 图2-1：AI数字人核心技术架构图",
            "  [Image: mermaid flowchart]",
        ]
        with patch(
            "backend.runner.preview.subprocess.run",
            return_value=Mock(returncode=0, stdout="\n".join(lines)),
        ):
            warnings = check_figure_adjacency_warnings(FIXTURE_DOCX)
        self.assertEqual(warnings, [])


if __name__ == "__main__":
    unittest.main()
