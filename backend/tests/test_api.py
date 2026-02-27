import importlib
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))


class FakeService:
    last_transcribe_path: str | None = None

    def __init__(self, whisper_model: str, llm_base_url: str, llm_api_key: str, llm_model: str):
        self.whisper_model = whisper_model
        self.llm_base_url = llm_base_url
        self.llm_api_key = llm_api_key
        self.llm_model = llm_model

    def get_default_system_prompt(self) -> str:
        return "DEFAULT PROMPT"

    def transcribe(self, audio_file: str) -> str:
        FakeService.last_transcribe_path = audio_file
        return "raw transcript"

    def clean_with_llm(self, text: str, system_prompt: str | None = None) -> str:
        if text == "raise":
            from transcription import LLMServiceError

            raise LLMServiceError("llm offline")
        return f"cleaned: {text}"

    async def stream_clean(self, text: str, system_prompt: str | None = None):
        if text == "raise":
            from transcription import LLMServiceError

            raise LLMServiceError("stream failed")
        yield "hello"
        yield " world"


@pytest.fixture
def app_module(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setenv("WHISPER_MODEL", "small.en")
    monkeypatch.setenv("LLM_BASE_URL", "http://localhost:11434/v1")
    monkeypatch.setenv("LLM_API_KEY", "ollama")
    monkeypatch.setenv("LLM_MODEL", "gemma3:4b")

    module = importlib.import_module("app")
    return importlib.reload(module)


@pytest.fixture
def client(app_module, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(app_module, "TranscriptionService", FakeService)
    app = app_module.create_app()
    with TestClient(app) as test_client:
        yield test_client


def test_status_ready(client: TestClient):
    response = client.get("/api/status")
    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "ready"
    assert payload["whisper_model"] == "small.en"


def test_system_prompt(client: TestClient):
    response = client.get("/api/system-prompt")
    assert response.status_code == 200
    assert response.json()["default_prompt"] == "DEFAULT PROMPT"


def test_transcribe_rejects_empty_file(client: TestClient):
    response = client.post(
        "/api/transcribe",
        files={"audio": ("empty.wav", b"", "audio/wav")},
    )
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


def test_transcribe_preserves_extension_for_temp_file(client: TestClient):
    response = client.post(
        "/api/transcribe",
        files={"audio": ("sample.mp3", b"dummy-bytes", "audio/mpeg")},
    )
    assert response.status_code == 200
    assert response.json()["text"] == "raw transcript"

    assert FakeService.last_transcribe_path is not None
    assert Path(FakeService.last_transcribe_path).suffix == ".mp3"


def test_clean_returns_502_on_llm_failure(client: TestClient):
    response = client.post("/api/clean", json={"text": "raise"})
    assert response.status_code == 502
    assert "llm offline" in response.json()["detail"]


def test_clean_stream_surfaces_error_event(client: TestClient):
    response = client.post("/api/clean/stream", json={"text": "raise"})
    assert response.status_code == 200
    body = response.text
    assert '"code": "LLM_ERROR"' in body
    assert "[DONE]" in body


def test_config_validation_fails_with_missing_env(app_module, monkeypatch: pytest.MonkeyPatch):
    monkeypatch.delenv("LLM_MODEL", raising=False)
    with pytest.raises(RuntimeError, match="Missing required environment variables"):
        app_module.load_config_from_env()
