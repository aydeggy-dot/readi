from readi_worker.cv.extract import DOCX, MAX_CHARS, PDF, extract_text
from tests.cv_files import (
    CV_LINES,
    make_docx,
    make_encrypted_pdf,
    make_pdf,
    make_zip_bomb_docx,
)


def test_extracts_pdf_text() -> None:
    result = extract_text(make_pdf(CV_LINES), PDF)
    assert result.error is None
    assert result.text is not None
    assert "React" in result.text
    assert "University of Lagos" in result.text


def test_extracts_docx_body_and_tables_but_not_headers() -> None:
    data = make_docx(
        CV_LINES, header="Ada Obi · ada@example.com", table=[["Skill", "Years"], ["Go", "2"]]
    )
    result = extract_text(data, DOCX)
    assert result.text is not None
    assert "Market price tracker" in result.text
    assert "Go | 2" in result.text
    assert "ada@example.com" not in result.text


def test_scanned_or_empty_pdf_is_no_text() -> None:
    assert extract_text(make_pdf([]), PDF).error == "no_text"


def test_encrypted_pdf() -> None:
    assert extract_text(make_encrypted_pdf(CV_LINES), PDF).error == "encrypted"


def test_type_mismatch_and_garbage_are_invalid_files() -> None:
    assert extract_text(make_docx(CV_LINES), PDF).error == "invalid_file"
    assert extract_text(make_pdf(CV_LINES), DOCX).error == "invalid_file"
    assert extract_text(b"%PDF-1.7 garbage", PDF).error in {"invalid_file", "no_text"}
    assert extract_text(b"hello", "text/plain").error == "invalid_file"


def test_zip_bomb_is_refused_before_decompression() -> None:
    assert extract_text(make_zip_bomb_docx(), DOCX).error == "too_large"


def test_long_text_is_truncated() -> None:
    lines = [f"Line {i} with some filler words about software engineering" for i in range(1500)]
    result = extract_text(make_docx(lines), DOCX)
    assert result.truncated
    assert result.text is not None
    assert len(result.text) == MAX_CHARS
