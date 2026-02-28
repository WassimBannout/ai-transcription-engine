#!/usr/bin/env python3
"""Transcription and LLM cleaning service primitives."""

import logging
from collections.abc import AsyncGenerator
from pathlib import Path

from faster_whisper import WhisperModel
from openai import AsyncOpenAI, OpenAI

logger = logging.getLogger(__name__)

# Edit system_prompt.txt to change how the LLM cleans transcriptions
_PROMPT_FILE = Path(__file__).parent / "system_prompt.txt"
_FALLBACK_SYSTEM_PROMPT = (
    "You are a transcript editor. Transform raw transcripts into clear, concise text. "
    "Remove filler words, fix grammar, and preserve key points. "
    "Return ONLY the cleaned text with NO preamble."
)

try:
    SYSTEM_PROMPT = _PROMPT_FILE.read_text().strip() or _FALLBACK_SYSTEM_PROMPT
except OSError:
    logger.warning("system_prompt.txt not found — using built-in fallback prompt")
    SYSTEM_PROMPT = _FALLBACK_SYSTEM_PROMPT


class LLMServiceError(RuntimeError):
    """Raised when LLM generation fails."""


class TranscriptionService:
    """OpenAI-compatible transcription and cleaning service."""

    def __init__(
        self,
        whisper_model: str,
        llm_base_url: str,
        llm_api_key: str,
        llm_model: str,
        whisper_language: str = "en",
    ):
        logger.info("Loading Whisper model '%s'...", whisper_model)
        self.whisper = WhisperModel(
            whisper_model,
            device="auto",  # Auto-detect: Metal (Mac), CUDA (NVIDIA), or CPU
            compute_type="int8",
        )
        self.whisper_language = whisper_language
        logger.info("Whisper model '%s' loaded", whisper_model)

        logger.info("Connecting to LLM at %s...", llm_base_url)
        self.llm_base_url = llm_base_url
        self.llm_api_key = llm_api_key
        self.llm_model = llm_model
        self.llm_client = OpenAI(base_url=llm_base_url, api_key=llm_api_key)
        self.async_llm_client = AsyncOpenAI(base_url=llm_base_url, api_key=llm_api_key)

        try:
            self.llm_client.models.list()
            logger.info("Connected to LLM API")
        except Exception as e:
            logger.warning("Could not connect to LLM at %s: %s", llm_base_url, e)

    def transcribe(self, audio_file: str) -> str:
        logger.info("Transcribing %s", audio_file)

        segments, _info = self.whisper.transcribe(
            audio_file,
            beam_size=5,
            language=self.whisper_language,
            condition_on_previous_text=False,
        )

        text = " ".join(segment.text for segment in segments).strip()
        logger.info("Raw transcript: %s", text)
        return text

    def get_default_system_prompt(self) -> str:
        return SYSTEM_PROMPT

    def clean_with_llm(self, text: str, system_prompt: str | None = None) -> str:
        if not text:
            return ""

        prompt_to_use = system_prompt if system_prompt else SYSTEM_PROMPT

        logger.info("Cleaning with LLM...")

        try:
            response = self.llm_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": prompt_to_use},
                    {"role": "user", "content": text},
                ],
                temperature=0.3,
                max_tokens=2000,
            )

            message_content = response.choices[0].message.content
            cleaned = message_content.strip() if message_content else ""
            logger.info("Cleaned transcript: %s", cleaned)
            return cleaned

        except Exception as e:
            logger.exception("LLM cleaning error")
            raise LLMServiceError(f"LLM cleaning failed: {e}") from e

    async def stream_clean(
        self, text: str, system_prompt: str | None = None
    ) -> AsyncGenerator[str, None]:
        """Stream LLM cleaning responses token by token via AsyncOpenAI."""
        if not text:
            return

        prompt_to_use = system_prompt if system_prompt else SYSTEM_PROMPT

        logger.info("Streaming LLM clean...")

        try:
            stream = await self.async_llm_client.chat.completions.create(
                model=self.llm_model,
                messages=[
                    {"role": "system", "content": prompt_to_use},
                    {"role": "user", "content": text},
                ],
                temperature=0.3,
                max_tokens=2000,
                stream=True,
            )

            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    yield delta

        except Exception as e:
            logger.exception("Streaming LLM error")
            raise LLMServiceError(f"Streaming LLM failed: {e}") from e
