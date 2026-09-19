from pathlib import Path

import pytest

from readi_worker.cv.parse import CvExtraction
from readi_worker.llm.fake import ScriptedLLMClient
from readi_worker.tools import compare_cv_parse
from tests.cv_files import CV_LINES, make_docx, make_pdf


class _FakeAnthropic(ScriptedLLMClient):
    def __init__(self, *_args: object, **_kwargs: object) -> None:
        extraction = CvExtraction(skills=["React"], projects=[], experience=[], gaps=[])
        super().__init__([extraction] * 10)

    async def aclose(self) -> None:
        pass


async def test_compares_models_and_writes_a_local_report(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    (tmp_path / "a.pdf").write_bytes(make_pdf(CV_LINES))
    (tmp_path / "b.docx").write_bytes(make_docx(CV_LINES))
    (tmp_path / "notes.txt").write_text("ignored")
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-ant-test-not-real")
    monkeypatch.setattr(compare_cv_parse, "AnthropicLLMClient", _FakeAnthropic)
    monkeypatch.setattr(compare_cv_parse, "REPORT_DIR", tmp_path / "report")

    code = await compare_cv_parse.main(
        [str(tmp_path), "--models", "claude-sonnet-5,claude-haiku-4-5"]
    )

    out = capsys.readouterr().out
    assert code == 0
    assert "[1/2] a.pdf" in out
    assert "[2/2] b.docx" in out
    assert "claude-haiku-4-5" in out
    [report] = (tmp_path / "report").iterdir()
    assert '"React"' in report.read_text()
