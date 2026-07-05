"""Tests for document HTML preview generation."""
from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

from backend.runner.preview import (
    DOCUMENT_HTML_NAME,
    DOCUMENT_OUTLINE_NAME,
    EMBED_MARKER,
    PREVIEW_COVER_PAGES,
    PREVIEW_SCREENSHOT_HEIGHT,
    PREVIEW_SCREENSHOT_WIDTH,
    check_list_format_warnings,
    check_figure_adjacency_warnings,
    check_figure_render_warnings,
    check_figure_layout_warnings,
    check_heading_hierarchy_warnings,
    enhance_document_html_for_embed,
    filter_nav_headings,
    find_document_html,
    find_document_outline,
    generate_docx_html,
    generate_docx_outline,
    generate_docx_previews,
    load_document_outline,
    read_document_html_content,
)

FIXTURE_ROOT = Path(__file__).resolve().parent / "fixtures" / "preview_test"
FIXTURE_DOCX = FIXTURE_ROOT / "exports" / "test.docx"


class PreviewHtmlTests(unittest.TestCase):
    def setUp(self) -> None:
        self.preview_dir = FIXTURE_ROOT / ".preview"
        self.html_path = self.preview_dir / DOCUMENT_HTML_NAME
        if self.html_path.is_file():
            self.html_path.unlink()

    def test_enhance_document_html_for_embed_injects_marker(self) -> None:
        raw = "<html><head></head><body><p>hi</p></body></html>"
        out = enhance_document_html_for_embed(raw)
        self.assertIn(EMBED_MARKER, out)
        self.assertIn("word-web-embed", out)
        self.assertIn("overflow: visible", out)
        self.assertIn(".toc a[href^=\"#\"]", out)
        self.assertIn(".wg {", out)
        self.assertIn("clear: both", out)
        self.assertEqual(enhance_document_html_for_embed(out), out)

    def test_read_document_html_content(self) -> None:
        if not self.html_path.parent.exists():
            self.preview_dir.mkdir(parents=True, exist_ok=True)
        self.html_path.write_text("<html><body>x</body></html>", encoding="utf-8")
        content = read_document_html_content(self.html_path)
        self.assertIn(EMBED_MARKER, content)

    def test_generate_docx_html_persists_embed_marker(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        ok = generate_docx_html(FIXTURE_ROOT, FIXTURE_DOCX)
        self.assertTrue(ok)
        content = self.html_path.read_text(encoding="utf-8")
        self.assertIn(EMBED_MARKER, content)
        self.assertIn(".wg {", content)

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

    def test_generate_docx_previews_uses_a4_portrait_dimensions(self) -> None:
        if not FIXTURE_DOCX.is_file():
            self.skipTest("fixture docx missing")
        cover = self.preview_dir / "page-1.png"
        cover.unlink(missing_ok=True)

        def fake_run(cmd, **kwargs):
            out_idx = cmd.index("-o") + 1
            Path(cmd[out_idx]).write_bytes(b"\x89PNG")
            return Mock(returncode=0)

        with patch("backend.runner.preview.subprocess.run", side_effect=fake_run) as run_mock:
            with patch("backend.runner.preview.shutil.which", return_value="/usr/bin/officecli"):
                ok = generate_docx_previews(FIXTURE_ROOT, FIXTURE_DOCX)
            self.assertTrue(ok)
            cmd = run_mock.call_args[0][0]
            self.assertIn("--screenshot-width", cmd)
            self.assertIn(str(PREVIEW_SCREENSHOT_WIDTH), cmd)
            self.assertIn("--screenshot-height", cmd)
            self.assertIn(str(PREVIEW_SCREENSHOT_HEIGHT), cmd)
            self.assertEqual(PREVIEW_SCREENSHOT_WIDTH, 840)
            self.assertEqual(PREVIEW_SCREENSHOT_HEIGHT, 1188)
            self.assertEqual(run_mock.call_count, PREVIEW_COVER_PAGES)
            self.assertEqual(PREVIEW_COVER_PAGES, 1)

    def test_filter_nav_headings_excludes_cover(self) -> None:
        headings = [
            {"line": 1, "text": "封面标题", "level": 0, "style": "Title", "data_path": "/body/p[1]"},
            {"line": 2, "text": "副标题", "level": 1, "style": "Subtitle", "data_path": "/body/p[2]"},
            {"line": 3, "text": "第一章", "level": 1, "style": "Heading1", "data_path": "/body/p[3]"},
            {"line": 4, "text": "1.1 节", "level": 2, "style": "Heading2", "data_path": "/body/p[4]"},
        ]
        filtered = filter_nav_headings(headings)
        self.assertEqual(len(filtered), 2)
        self.assertEqual(filtered[0]["style"], "Heading1")

    def test_load_document_outline_nav_only(self) -> None:
        outline_path = self.preview_dir / DOCUMENT_OUTLINE_NAME
        outline_path.parent.mkdir(parents=True, exist_ok=True)
        outline_path.write_text(
            '{"headings": ['
            '{"line": 1, "text": "T", "level": 0, "style": "Title"},'
            '{"line": 2, "text": "H", "level": 1, "style": "Heading1"}'
            "]}",
            encoding="utf-8",
        )
        all_headings = load_document_outline(FIXTURE_ROOT, nav_only=False)
        nav_headings = load_document_outline(FIXTURE_ROOT, nav_only=True)
        self.assertEqual(len(all_headings), 2)
        self.assertEqual(len(nav_headings), 1)
        self.assertEqual(nav_headings[0]["style"], "Heading1")

    def test_check_heading_hierarchy_warnings_empty_outline(self) -> None:
        docx = FIXTURE_ROOT / "exports" / "test.docx"
        if not docx.is_file():
            self.skipTest("fixture docx missing")
        with patch("backend.runner.preview._load_outline_from_docx", return_value=[]):
            from backend.api.schemas.job_options import JobOptions

            warnings = check_heading_hierarchy_warnings(docx, JobOptions())
        self.assertEqual(len(warnings), 1)
        self.assertIn("Heading1", warnings[0])

    def test_analyze_h1_body_sections_counts_lists(self) -> None:
        from backend.runner.preview import _analyze_h1_body_sections

        text = "\n".join([
            "[段落 /body/p[1]] style=Heading1 第一章",
            "[段落 /body/p[2]] style=Normal 导语",
            "[段落 /body/p[3]] style=Normal listStyle=ordered 第一项",
            "[段落 /body/p[4]] style=Normal listStyle=ordered 第二项",
            "[段落 /body/p[5]] style=Normal listStyle=bullet 要点",
            "[段落 /body/p[6]] style=Heading1 第二章",
        ])
        sections = _analyze_h1_body_sections(text)
        self.assertEqual(len(sections), 2)
        self.assertEqual(sections[0]["normal"], 4)
        self.assertEqual(sections[0]["ordered"], 2)
        self.assertEqual(sections[0]["bullet"], 1)

    def test_check_heading_hierarchy_warnings_missing_nav(self) -> None:
        from backend.api.schemas.job_options import JobOptions

        docx = FIXTURE_ROOT / "exports" / "test.docx"
        if not docx.is_file():
            self.skipTest("fixture docx missing")
        with patch("backend.runner.preview._load_outline_from_docx", return_value=[]):
            warnings = check_heading_hierarchy_warnings(docx, JobOptions())
        self.assertTrue(any("Heading1/Heading2" in w for w in warnings))

    def test_check_list_format_warnings_lead_in_as_bullet(self) -> None:
        docx = FIXTURE_ROOT / "exports" / "test.docx"
        if not docx.is_file():
            self.skipTest("fixture docx missing")
        annotated = "\n".join([
            "[段落 /body/p[1]] style=Normal listStyle=bullet 模型推理与服务模块的关键能力：",
            "[段落 /body/p[2]] style=Normal listStyle=bullet 自然语言理解",
        ])
        with patch("backend.runner.preview._fetch_annotated_text", return_value=annotated):
            warnings = check_list_format_warnings(docx)
        self.assertTrue(any("引导句" in w for w in warnings))


if __name__ == "__main__":
    unittest.main()
