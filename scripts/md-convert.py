"""Convert PDF/DOCX files to Markdown with markitdown.

Usage: python -m pip install "markitdown[all]"
       python scripts/md-convert.py <file.pdf|file.docx> [...]

Each .md is written next to its source file, same name.
shortcut: file.pdf and file.docx in one folder both map to file.md and overwrite, run them separately or rename, upgrade to src.name + ".md" if that bites.
"""

import sys
from pathlib import Path

from markitdown import MarkItDown

if len(sys.argv) < 2:
    sys.exit(__doc__)

md = MarkItDown()
for name in sys.argv[1:]:
    src = Path(name)
    dst = src.with_suffix(".md")
    dst.write_text(md.convert(str(src)).text_content, encoding="utf-8")
    print(f"{src} -> {dst}")
