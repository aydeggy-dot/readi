"""Builds e2e/fixtures/cv.pdf, the CV the end-to-end test uploads: a tiny PDF whose text pypdf
extracts, so the worker parses it for real. Regenerate with: python3 e2e/fixtures/make-cv-pdf.py e2e/fixtures/cv.pdf"""
import sys

LINES = [
    "Ada Obi - Backend Engineer",
    "Skills: Python, Go, PostgreSQL, Docker, REST APIs",
    "Experience: Backend engineer at Paystack (2023-2026):",
    "built payment APIs in Go and PostgreSQL.",
    "Projects: Ledger service - double-entry ledger in Go.",
    "Education: BSc Computer Science, University of Lagos.",
]

def pdf(lines):
    text = "BT /F1 12 Tf 60 760 Td 16 TL\n" + "".join(f"({l}) Tj T*\n" for l in lines) + "ET"
    objs = [
        "<< /Type /Catalog /Pages 2 0 R >>",
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
        f"<< /Length {len(text)} >>\nstream\n{text}\nendstream",
        "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    ]
    out = "%PDF-1.4\n"
    offsets = []
    for i, body in enumerate(objs, start=1):
        offsets.append(len(out))
        out += f"{i} 0 obj\n{body}\nendobj\n"
    start = len(out)
    out += f"xref\n0 {len(objs)+1}\n0000000000 65535 f \n"
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets)
    out += f"trailer\n<< /Size {len(objs)+1} /Root 1 0 R >>\nstartxref\n{start}\n%%EOF\n"
    return out.encode("latin-1")

open(sys.argv[1], "wb").write(pdf(LINES))
