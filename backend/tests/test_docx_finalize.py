"""Tests for docx post-processing finalization."""
from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.api.schemas.job_options import JobOptions
from backend.runner import docx_finalize


def test_toc_has_placeholder_detects_update_field():
    with patch.object(docx_finalize, "_annotated_text", return_value="Update field to see table of contents"):
        assert docx_finalize.toc_has_placeholder(Path("fake.docx")) is True


def test_toc_has_placeholder_false_when_populated():
    with patch.object(docx_finalize, "_annotated_text", return_value="目录\n1 引言\n2 背景"):
        assert docx_finalize.toc_has_placeholder(Path("fake.docx")) is False


def test_doc_has_toc_detects_placeholder():
    with patch.object(docx_finalize, "_annotated_text", return_value="Update field to see table of contents"):
        assert docx_finalize.doc_has_toc(Path("fake.docx")) is True


def test_ensure_toc_rendered_skips_when_already_populated(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    with patch.object(docx_finalize, "toc_has_placeholder", return_value=False):
        assert docx_finalize.ensure_toc_rendered(docx) == []


def test_ensure_toc_rendered_returns_warning_when_all_steps_fail(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")

    with (
        patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"),
        patch.object(docx_finalize, "toc_has_placeholder", side_effect=[True, True]),
        patch.object(docx_finalize, "_try_set_toc_prerender", return_value=False),
        patch.object(docx_finalize, "_try_refresh", return_value=False),
        patch.object(docx_finalize, "_try_reinsert_toc", return_value=False),
        patch.object(docx_finalize, "_try_libreoffice_refresh", return_value=False),
    ):
        warnings = docx_finalize.ensure_toc_rendered(docx)

    assert len(warnings) == 1
    assert "F9" in warnings[0] or "更新域" in warnings[0]


def test_finalize_docx_runs_toc_and_figure_checks_when_present(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    options = JobOptions()

    with (
        patch.object(docx_finalize, "doc_has_toc", return_value=True),
        patch.object(docx_finalize, "doc_has_figures", return_value=True),
        patch.object(docx_finalize, "ensure_toc_rendered", return_value=["toc warn"]) as toc_mock,
        patch.object(docx_finalize, "toc_has_placeholder", return_value=False),
        patch.object(docx_finalize, "normalize_heading_styles", return_value=[]),
        patch.object(docx_finalize, "ensure_toc_page_break", return_value=[]),
        patch.object(docx_finalize, "normalize_caption_alignment", return_value=[]),
        patch.object(docx_finalize, "normalize_body_and_list_indent", return_value=[]),
        patch.object(docx_finalize, "normalize_diagram_layout", return_value=[]) as norm_mock,
        patch.object(docx_finalize, "reposition_misplaced_diagrams", return_value=[]) as repo_mock,
        patch.object(docx_finalize, "validate_figure_layout", return_value=["layout warn"]) as layout_mock,
        patch.object(docx_finalize, "check_heading_hierarchy_warnings", return_value=["head warn"]) as head_mock,
        patch.object(docx_finalize, "check_figure_adjacency_warnings", return_value=[]),
        patch.object(docx_finalize, "check_figure_layout_blocking", return_value=[]),
        patch.object(docx_finalize, "check_caption_alignment_warnings", return_value=[]),
        patch.object(docx_finalize, "check_list_format_warnings", return_value=[]),
        patch.object(docx_finalize, "run_officecli_validate", return_value=[]),
    ):
        result = docx_finalize.finalize_docx(docx, options, project_dir=tmp_path)

    toc_mock.assert_called_once_with(docx)
    norm_mock.assert_called_once_with(docx)
    repo_mock.assert_called_once_with(docx)
    layout_mock.assert_called_once_with(docx, options)
    head_mock.assert_called_once_with(docx, options)
    assert "toc warn" in result.warnings
    assert result.quality_status == "warnings"
    assert result.job_status == "done"
    report = tmp_path / docx_finalize.VALIDATION_REPORT_NAME
    assert report.is_file()


def test_finalize_docx_skips_toc_and_figures_when_absent(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    options = JobOptions()

    with (
        patch.object(docx_finalize, "doc_has_toc", return_value=False),
        patch.object(docx_finalize, "doc_has_figures", return_value=False),
        patch.object(docx_finalize, "ensure_toc_rendered") as toc_mock,
        patch.object(docx_finalize, "normalize_heading_styles", return_value=[]),
        patch.object(docx_finalize, "ensure_toc_page_break", return_value=[]),
        patch.object(docx_finalize, "normalize_caption_alignment", return_value=[]),
        patch.object(docx_finalize, "normalize_body_and_list_indent", return_value=[]),
        patch.object(docx_finalize, "normalize_diagram_layout") as norm_mock,
        patch.object(docx_finalize, "check_list_format_warnings", return_value=[]),
        patch.object(docx_finalize, "check_heading_hierarchy_warnings", return_value=[]),
        patch.object(docx_finalize, "run_officecli_validate", return_value=[]),
    ):
        result = docx_finalize.finalize_docx(docx, options, project_dir=tmp_path)

    toc_mock.assert_not_called()
    norm_mock.assert_not_called()
    assert result.quality_status == "passed"


def test_finalize_docx_blocking_still_done(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    options = JobOptions()

    with (
        patch.object(docx_finalize, "doc_has_toc", return_value=False),
        patch.object(docx_finalize, "doc_has_figures", return_value=True),
        patch.object(docx_finalize, "normalize_heading_styles", return_value=[]),
        patch.object(docx_finalize, "ensure_toc_page_break", return_value=[]),
        patch.object(docx_finalize, "normalize_caption_alignment", return_value=[]),
        patch.object(docx_finalize, "normalize_body_and_list_indent", return_value=[]),
        patch.object(docx_finalize, "normalize_diagram_layout", return_value=[]),
        patch.object(docx_finalize, "reposition_misplaced_diagrams", return_value=[]),
        patch.object(docx_finalize, "validate_figure_layout", return_value=[]),
        patch.object(docx_finalize, "check_heading_hierarchy_warnings", return_value=[]),
        patch.object(docx_finalize, "check_figure_adjacency_warnings", return_value=["图题与图片未相邻：x"]),
        patch.object(docx_finalize, "check_figure_layout_blocking", return_value=["图表插入在列表项之间"]),
        patch.object(docx_finalize, "check_caption_alignment_warnings", return_value=[]),
        patch.object(docx_finalize, "check_list_format_warnings", return_value=[]),
        patch.object(docx_finalize, "run_officecli_validate", return_value=["schema error"]),
    ):
        result = docx_finalize.finalize_docx(docx, options, project_dir=tmp_path)

    assert result.quality_status == "failed"
    assert result.job_status == "done"
    assert any("OpenXML" in b for b in result.blocking)


def test_run_officecli_validate_parses_json_errors(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    payload = json.dumps({"valid": False, "errors": ["bad relationship"]})

    with patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"), patch.object(
        docx_finalize,
        "_officecli",
        return_value=MagicMock(returncode=1, stdout=payload, stderr=""),
    ):
        errors = docx_finalize.run_officecli_validate(docx)

    assert errors == ["bad relationship"]


def test_check_figure_richness_no_longer_enforced(tmp_path: Path):
    from backend.runner.preview import check_figure_richness_warnings

    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    options = JobOptions()
    assert check_figure_richness_warnings(docx, options) == []



def test_ensure_toc_page_break_inserts_before_first_h1(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    annotated = "\n".join([
        "[段落 /body/p[1] paraId=AAAABBBB] style=TOC 目录",
        "[段落 /body/p[2] paraId=CCCCDDDD] style=Heading1 第一章",
    ])

    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(list(args))
        return MagicMock(returncode=0, stdout="", stderr="")

    with (
        patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"),
        patch.object(docx_finalize, "doc_has_toc", return_value=True),
        patch.object(docx_finalize, "_fetch_annotated_text", return_value=annotated),
        patch.object(docx_finalize, "_officecli", side_effect=fake_run),
    ):
        notes = docx_finalize.ensure_toc_page_break(docx)

    assert notes
    joined = " ".join(" ".join(c) for c in calls)
    assert "pagebreak" in joined
    assert "pageBreakBefore=true" in joined
    assert "/body/p[2]" in joined


def test_doc_has_figures_detects_diagram_line():
    from backend.runner.preview import doc_has_figures

    annotated = "[/body/p[@paraId=00100072]] [Diagram: name=\"Diagram 12\", 14.0cm×10.0cm] ← Normal"
    with patch("backend.runner.preview._fetch_annotated_text", return_value=annotated):
        assert doc_has_figures(Path("fake.docx")) is True


def test_check_figure_layout_warnings_skips_when_no_figures(tmp_path: Path):
    from backend.runner.preview import check_figure_layout_warnings

    docx = tmp_path / "report.docx"
    options = JobOptions()
    with patch("backend.runner.preview.doc_has_figures", return_value=False):
        assert check_figure_layout_warnings(docx, options) == []


def test_check_figure_layout_warnings_missing_caption(tmp_path: Path):
    from backend.runner.preview import check_figure_layout_warnings

    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    options = JobOptions()
    annotated = "\n".join([
        "[/body/p[@paraId=00100070]] • 要点 ← Normal listStyle=bullet",
        "[/body/p[@paraId=00100072]] [Image: name=\"Diagram 12\", 7.0cm×27.9cm] ← Normal",
        "[/body/p[@paraId=00100080]] 「第二章」 ← heading 1",
    ])

    with (
        patch("backend.runner.preview.doc_has_figures", return_value=True),
        patch("backend.runner.preview._fetch_annotated_text", return_value=annotated),
    ):
        warnings = check_figure_layout_warnings(docx, options)

    assert any("缺少图题" in w for w in warnings)


def test_check_figure_layout_blocking(tmp_path: Path):
    from backend.runner.preview import check_figure_layout_blocking

    docx = tmp_path / "report.docx"
    options = JobOptions()
    annotated = "\n".join([
        "[Caption] 图1-1：架构",
        "[Normal] listStyle=ordered 一",
        "[Diagram: name=\"Diagram 1\", 14cm×10cm]",
    ])

    with (
        patch("backend.runner.preview.doc_has_figures", return_value=True),
        patch("backend.runner.preview._fetch_annotated_text", return_value=annotated),
    ):
        blocking = check_figure_layout_blocking(docx, options)

    assert any("列表项之间" in b for b in blocking)


def test_check_delivery_gate_token_leaks(tmp_path: Path):
    from backend.runner.docx_finalize import check_delivery_gate_token_leaks

    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    with patch("backend.runner.docx_finalize._fetch_plain_text", return_value="Hello {{name}} world"):
        leaks = check_delivery_gate_token_leaks(docx)
    assert leaks
    assert "Gate2" in leaks[0]


def test_normalize_body_and_list_indent_sets_props(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    annotated = "\n".join([
        "[段落 /body/p[1]] style=Normal 正文段落",
        "[段落 /body/p[2]] style=Normal listStyle=bullet 要点一",
    ])

    calls: list[list[str]] = []

    def fake_run(args, **kwargs):
        calls.append(list(args))
        return MagicMock(returncode=0, stdout="", stderr="")

    with (
        patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"),
        patch.object(docx_finalize, "_fetch_annotated_text", return_value=annotated),
        patch.object(docx_finalize, "_officecli", side_effect=fake_run),
    ):
        notes = docx_finalize.normalize_body_and_list_indent(docx)

    assert notes
    joined = " ".join(" ".join(c) for c in calls)
    assert "firstLineIndent=420" in joined
    assert "hangingIndent=360" in joined


def test_normalize_caption_alignment_sets_center(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")

    query_payload = json.dumps({
        "data": {"results": [{"path": "/body/p[3]", "format": {"align": "left"}}]},
    })

    def fake_run(args, **kwargs):
        cmd = " ".join(args)
        if "query" in cmd:
            return MagicMock(returncode=0, stdout=query_payload, stderr="")
        if "set" in cmd and "align=center" in cmd:
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=1, stdout="", stderr="")

    with patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"), patch.object(
        docx_finalize, "_officecli", side_effect=fake_run,
    ):
        notes = docx_finalize.normalize_caption_alignment(docx)

    assert notes
    assert "居中" in notes[0]


def test_normalize_heading_styles_promotes_chapter_title(tmp_path: Path):
    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    annotated = "[段落 /body/p[2]] style=Normal 第一章 概述"

    def fake_run(args, **kwargs):
        if "set" in " ".join(args) and "Heading1" in " ".join(args):
            return MagicMock(returncode=0, stdout="", stderr="")
        return MagicMock(returncode=1, stdout="", stderr="")

    with (
        patch.object(docx_finalize.shutil, "which", return_value="/usr/bin/officecli"),
        patch.object(docx_finalize, "_fetch_annotated_text", return_value=annotated),
        patch.object(docx_finalize, "_officecli", side_effect=fake_run),
    ):
        notes = docx_finalize.normalize_heading_styles(docx, JobOptions())

    assert any("Heading1" in n for n in notes)


def test_check_delivery_gate_page_field_skips_short_doc(tmp_path: Path):
    from backend.runner.docx_finalize import check_delivery_gate_page_field

    docx = tmp_path / "report.docx"
    docx.write_bytes(b"pk")
    with patch("backend.runner.docx_finalize._heading_count", return_value=2):
        assert check_delivery_gate_page_field(docx) == []
