"""규칙/규칙서.md -> 인쇄/규칙서.pdf (A4). 마크다운을 HTML로 바꾸고 크롬으로 PDF를 뽑는다.

실행: python 규칙서_만들기.py   (크롬 필요)
"""
import html
import re
import subprocess
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "규칙" / "규칙서.md"
OUT = HERE / "인쇄" / "규칙서.pdf"
CHROME = "C:/Program Files/Google/Chrome/Application/chrome.exe"
CSS = """
@page { size: A4; margin: 14mm 14mm 16mm; }
body { font-family: "Malgun Gothic", sans-serif; font-size: 10pt; line-height: 1.5; color: #111; }
h1 { font-size: 22pt; text-align: center; border-bottom: 2px solid #333; padding-bottom: 4mm; }
h2 { font-size: 14pt; border-bottom: 1px solid #999; margin-top: 7mm; break-after: avoid; }
h3 { font-size: 11pt; margin: 4mm 0 1mm; break-after: avoid; }
table { border-collapse: collapse; width: 100%; margin: 2mm 0; break-inside: avoid; }
th, td { border: 1px solid #aaa; padding: 1mm 2mm; vertical-align: top; }
th { background: #eee; }
.note { border-left: 4px solid #c90; background: #fff8e6; padding: 2mm 3mm; margin: 2mm 0; }
ul, ol { margin: 1mm 0; padding-left: 6mm; }
"""


def inline(s):
    s = html.escape(s)
    s = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", s)  # 링크는 글자만
    return re.sub(r"\*\*(.+?)\*\*", r"<b>\1</b>", s)


def to_html(md):
    out, lst, table = [], None, []

    def flush():
        nonlocal lst, table
        if lst:
            out.append(f"</{lst}>")
            lst = None
        if table:
            head, *rows = [[inline(c.strip()) for c in r.strip().strip("|").split("|")] for r in table]
            out.append("<table><tr>" + "".join(f"<th>{c}</th>" for c in head) + "</tr>"
                       + "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows) + "</table>")
            table = []

    for line in md.splitlines():
        s = line.strip()
        if s.startswith("|"):
            if not re.fullmatch(r"\|[\s|:-]+\|", s):  # 구분 줄은 뺀다
                table.append(s)
            continue
        if m := re.match(r"(\s*)(- |\d+\. )(.*)", line):
            tag = "ul" if m[2] == "- " else "ol"
            if table or lst != tag and not m[1]:
                flush()
                out.append(f"<{tag}>")
                lst = tag
            out.append(f"<li>{inline(m[3])}</li>")
            continue
        flush()
        if not s or s.startswith("Related") or s.startswith("> [!"):
            continue
        if m := re.match(r"(#+) (.*)", s):
            out.append(f"<h{len(m[1])}>{inline(m[2])}</h{len(m[1])}>")
        elif s.startswith(">"):
            out.append(f'<div class="note">{inline(s.lstrip("> "))}</div>')
        else:
            out.append(f"<p>{inline(s)}</p>")
    flush()
    return "\n".join(out)


def main():
    md = SRC.read_text(encoding="utf-8").split("---", 2)[2]
    page = f'<!doctype html><meta charset="utf-8"><style>{CSS}</style>{to_html(md)}'
    with tempfile.TemporaryDirectory() as tmp:
        src = Path(tmp) / "규칙서.html"
        src.write_text(page, encoding="utf-8")
        subprocess.run([CHROME, "--headless", "--disable-gpu", "--no-pdf-header-footer",
                        f"--print-to-pdf={OUT}", src.as_uri()], check=True, capture_output=True)
    print(f"ok: {OUT.name}")


if __name__ == "__main__":
    main()
