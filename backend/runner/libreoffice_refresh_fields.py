#!/usr/bin/env python3
"""LibreOffice UNO helper: refresh indexes/fields and save .docx (headless).

Invoked as:
  soffice --headless --invisible --python libreoffice_refresh_fields.py <input.docx> <out_dir>
"""
from __future__ import annotations

import sys
from pathlib import Path


def main() -> int:
    if len(sys.argv) != 3:
        return 2

    src = Path(sys.argv[1]).resolve()
    out_dir = Path(sys.argv[2]).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        import uno  # type: ignore[import-not-found]
        from com.sun.star.beans import PropertyValue  # type: ignore[import-not-found]
    except ImportError:
        print("uno module unavailable", file=sys.stderr)
        return 1

    local_context = uno.getComponentContext()
    smgr = local_context.ServiceManager
    desktop = smgr.createInstanceWithContext("com.sun.star.frame.Desktop", local_context)

    url = uno.systemPathToFileUrl(str(src))
    doc = desktop.loadComponentFromURL(
        url,
        "_blank",
        0,
        (PropertyValue(Name="Hidden", Value=True),),
    )
    if doc is None:
        print("failed to load document", file=sys.stderr)
        return 1

    try:
        if doc.supportsService("com.sun.star.text.GenericTextDocument"):
            indexes = doc.getDocumentIndexes()
            for i in range(indexes.getCount()):
                indexes.getByIndex(i).update()
        doc.refresh()
    except Exception as exc:  # noqa: BLE001 — UNO runtime errors vary
        print(f"refresh failed: {exc}", file=sys.stderr)
        doc.close(True)
        return 1

    out_url = uno.systemPathToFileUrl(str(out_dir / src.name))
    doc.storeToURL(
        out_url,
        (
            PropertyValue(Name="FilterName", Value="MS Word 2007 XML"),
            PropertyValue(Name="Overwrite", Value=True),
        ),
    )
    doc.close(True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
