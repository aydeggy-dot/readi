import base64
import uuid

from fastapi.testclient import TestClient

from readi_worker import main
from readi_worker.cv.parse import CvExtraction
from readi_worker.llm.fake import ScriptedLLMClient
from readi_worker.settings import Settings
from tests.conftest import SERVICE_TOKEN, FakeRedis
from tests.cv_files import CV_LINES, make_pdf

EXTRACTION = CvExtraction(skills=["React"], projects=[], experience=[], gaps=[])


def body() -> dict[str, str | None]:
    return {
        "request_id": str(uuid.uuid4()),
        "content_type": "application/pdf",
        "file_base64": base64.b64encode(make_pdf(CV_LINES)).decode(),
        "target_role_label": "Frontend engineer",
        "level_label": "Mid-level",
        "stack_label": None,
    }


def client(settings: Settings, llm: ScriptedLLMClient) -> TestClient:
    return TestClient(main.create_app(settings, redis=FakeRedis(), llm=llm))


def test_requires_the_service_token(settings: Settings) -> None:
    with client(settings, ScriptedLLMClient([])) as http:
        assert http.post("/cv/parse", json=body()).status_code == 401
        wrong = {"authorization": "Bearer " + "x" * 40}
        assert http.post("/cv/parse", json=body(), headers=wrong).status_code == 401


def test_parses_with_the_service_token(settings: Settings) -> None:
    with client(settings, ScriptedLLMClient([EXTRACTION])) as http:
        response = http.post(
            "/cv/parse", json=body(), headers={"authorization": f"Bearer {SERVICE_TOKEN}"}
        )
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "parsed"
    assert payload["parsed"]["skills"] == ["React"]
    assert payload["ai_calls"][0]["purpose"] == "cv_parse"


def test_rejects_invalid_requests(settings: Settings) -> None:
    auth = {"authorization": f"Bearer {SERVICE_TOKEN}"}
    with client(settings, ScriptedLLMClient([])) as http:
        assert (
            http.post(
                "/cv/parse", json={**body(), "content_type": "text/plain"}, headers=auth
            ).status_code
            == 422
        )
        assert (
            http.post(
                "/cv/parse", json={**body(), "email": "x@example.com"}, headers=auth
            ).status_code
            == 422
        )


def test_rejects_oversized_bodies(settings: Settings) -> None:
    auth = {"authorization": f"Bearer {SERVICE_TOKEN}", "content-type": "application/json"}
    with client(settings, ScriptedLLMClient([])) as http:
        response = http.post("/cv/parse", content=b"x" * (9 * 1024 * 1024), headers=auth)
    assert response.status_code == 413
