import json
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from transcription import LLMServiceError, TranscriptionService

load_dotenv()
logger = logging.getLogger("voice_script")


class CleanRequest(BaseModel):
    text: str
    system_prompt: str | None = None


MAX_UPLOAD_BYTES = 200 * 1024 * 1024  # 200 MB


class AppConfig(BaseModel):
    whisper_model: str
    whisper_language: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    cors_origins: list[str]


DEFAULT_CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
]


def _parse_cors_origins(value: str | None) -> list[str]:
    if not value:
        return DEFAULT_CORS_ORIGINS
    origins = [origin.strip() for origin in value.split(",") if origin.strip()]
    return origins if origins else DEFAULT_CORS_ORIGINS


def load_config_from_env() -> AppConfig:
    config = AppConfig(
        whisper_model=os.getenv("WHISPER_MODEL", "").strip(),
        whisper_language=os.getenv("WHISPER_LANGUAGE", "en").strip(),
        llm_base_url=os.getenv("LLM_BASE_URL", "").strip(),
        llm_api_key=os.getenv("LLM_API_KEY", "").strip(),
        llm_model=os.getenv("LLM_MODEL", "").strip(),
        cors_origins=_parse_cors_origins(os.getenv("CORS_ORIGINS")),
    )

    missing_fields: list[str] = []
    if not config.whisper_model:
        missing_fields.append("WHISPER_MODEL")
    if not config.llm_base_url:
        missing_fields.append("LLM_BASE_URL")
    if not config.llm_api_key:
        missing_fields.append("LLM_API_KEY")
    if not config.llm_model:
        missing_fields.append("LLM_MODEL")

    if missing_fields:
        missing = ", ".join(missing_fields)
        raise RuntimeError(
            f"Missing required environment variables: {missing}. "
            "Copy backend/.env.example to backend/.env and set values."
        )

    return config


def create_app() -> FastAPI:
    # Load config once — used for both CORS setup and the lifespan service init.
    config = load_config_from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        logger.info("Starting VoiceScript AI")
        app.state.config = config
        app.state.service = TranscriptionService(
            whisper_model=config.whisper_model,
            llm_base_url=config.llm_base_url,
            llm_api_key=config.llm_api_key,
            llm_model=config.llm_model,
            whisper_language=config.whisper_language,
        )
        logger.info("VoiceScript AI ready")
        yield

    app = FastAPI(title="VoiceScript AI", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def get_service() -> TranscriptionService:
        service = getattr(app.state, "service", None)
        if not service:
            raise HTTPException(status_code=503, detail="Service not ready")
        return service

    @app.get("/api/status")
    async def get_status():
        service_ready = bool(getattr(app.state, "service", None))
        return {
            "status": "ready" if service_ready else "initializing",
            "whisper_model": config.whisper_model,
            "llm_model": config.llm_model,
            "llm_base_url": config.llm_base_url,
        }

    @app.get("/api/system-prompt")
    async def get_system_prompt():
        service = get_service()
        return {"default_prompt": service.get_default_system_prompt()}

    @app.post("/api/transcribe")
    async def transcribe_audio(audio: Annotated[UploadFile, File()]):
        service = get_service()

        filename = audio.filename or "recording.webm"
        suffix = os.path.splitext(filename)[1] or ".webm"

        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            content = await audio.read()
            if not content:
                raise HTTPException(status_code=400, detail="Uploaded audio file is empty")
            if len(content) > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large (max {MAX_UPLOAD_BYTES // 1024 // 1024} MB)",
                )
            tmp.write(content)
            tmp_path = tmp.name

        try:
            raw_text = service.transcribe(tmp_path)
            return {"success": True, "text": raw_text}
        except Exception as e:
            logger.exception("Transcription failed")
            raise HTTPException(status_code=500, detail=f"Transcription failed: {e}") from e
        finally:
            if os.path.exists(tmp_path):
                os.unlink(tmp_path)

    @app.post("/api/clean")
    async def clean_text(request: CleanRequest):
        service = get_service()

        if not request.text.strip():
            return {"success": True, "text": ""}

        try:
            cleaned_text = service.clean_with_llm(
                request.text, system_prompt=request.system_prompt
            )
            return {"success": True, "text": cleaned_text}
        except LLMServiceError as e:
            raise HTTPException(status_code=502, detail=str(e)) from e
        except Exception as e:
            logger.exception("LLM cleaning failed")
            raise HTTPException(status_code=500, detail=f"Cleaning failed: {e}") from e

    @app.post("/api/clean/stream")
    async def clean_text_stream(request: CleanRequest):
        """Stream LLM cleaning responses via Server-Sent Events (SSE)."""
        service = get_service()

        async def event_stream():
            try:
                async for token in service.stream_clean(
                    request.text, system_prompt=request.system_prompt
                ):
                    payload = json.dumps({"token": token})
                    yield f"data: {payload}\n\n"
            except LLMServiceError as e:
                payload = json.dumps({"error": str(e), "code": "LLM_ERROR"})
                yield f"data: {payload}\n\n"
            except Exception as e:
                logger.exception("Unexpected streaming failure")
                payload = json.dumps({"error": str(e), "code": "INTERNAL_ERROR"})
                yield f"data: {payload}\n\n"
            finally:
                yield "data: [DONE]\n\n"

        return StreamingResponse(
            event_stream(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "X-Accel-Buffering": "no",
                "Connection": "keep-alive",
            },
        )

    return app


app = create_app()
