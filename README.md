# VoiceScript AI

A production-grade, full-stack AI transcription system that converts speech to polished, domain-specific text in real time. Built with OpenAI Whisper for accurate speech recognition and a streaming LLM pipeline for intelligent post-processing.

## Features

- **Real-time streaming** — LLM output streams token-by-token via Server-Sent Events; no waiting for the full response
- **Multi-input** — record from microphone (hold `V`), drag-and-drop audio files, or paste text directly
- **Domain presets** — five tuned system prompts for General, Meeting Notes, Technical, Interview, and Lecture/Podcast contexts
- **Flexible LLM backend** — works with Ollama (local), OpenAI, LM Studio, or any OpenAI-compatible API; swap providers via `.env`
- **Export** — download transcripts as Markdown (with metadata), plain text, or JSON for downstream use
- **Offline capable** — Whisper and a local LLM run entirely on-device; no data leaves your machine

## Architecture

```
Browser (React + TypeScript)
    │
    ├─ POST /api/transcribe   →  Whisper (faster-whisper, small.en)  →  raw text
    │
    └─ POST /api/clean/stream →  AsyncOpenAI → LLM (Ollama/OpenAI)
                                    │
                                    └─ SSE token stream  →  UI renders incrementally
```

**Backend:** FastAPI (async) · faster-whisper · AsyncOpenAI SDK
**Frontend:** React 19 · TypeScript · Vite
**Infrastructure:** Docker Compose · Ollama (local LLM runtime)

## Tech Stack

| Layer | Technology |
|---|---|
| Speech-to-text | [faster-whisper](https://github.com/SYSTRAN/faster-whisper) `small.en` |
| LLM | Ollama `gemma3:4b` (default) · swappable to OpenAI GPT-4o, etc. |
| API | FastAPI with async SSE streaming |
| Frontend | React 19 · TypeScript · Vite · CSS Modules |
| Containerization | Docker · Docker Compose |

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (4 GB RAM recommended)
- VS Code with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension

### 1. Open in Dev Container

```bash
git clone <your-repo-url>
cd ai-transcription-engine
code .
# VS Code: "Reopen in Container"
```

The container automatically installs Python and Node dependencies, downloads the Ollama model (~2 GB on first run), and creates a `.env` file from `.env.example`.

### 2. Start the servers

**Backend** (terminal 1):
```bash
cd backend
uv run uvicorn app:app --reload --port 8000
```

**Frontend** (terminal 2):
```bash
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Configuration

Copy `backend/.env.example` to `backend/.env` and edit as needed:

```env
# Local (Ollama — default)
LLM_BASE_URL=http://ollama:11434/v1
LLM_API_KEY=ollama
LLM_MODEL=gemma3:4b

# Cloud (OpenAI)
# LLM_BASE_URL=https://api.openai.com/v1
# LLM_API_KEY=sk-...
# LLM_MODEL=gpt-4o-mini

# Whisper model size (tiny.en / base.en / small.en / medium.en)
WHISPER_MODEL=small.en
```

Larger Whisper models improve accuracy at the cost of speed. `small.en` is the recommended default for a good accuracy/latency trade-off.

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/status` | Health check and model info |
| `GET` | `/api/system-prompt` | Load the default LLM system prompt |
| `POST` | `/api/transcribe` | Transcribe an audio file (multipart) |
| `POST` | `/api/clean` | Clean text with LLM (blocking) |
| `POST` | `/api/clean/stream` | Clean text with LLM (**SSE stream**) |

### SSE Streaming Protocol

`POST /api/clean/stream` returns a `text/event-stream` response:

```
data: {"token": "Here"}
data: {"token": " is"}
data: {"token": " the"}
data: {"token": " cleaned"}
data: {"token": " text."}
data: [DONE]
```

## Domain Presets

Each preset ships a tuned system prompt that changes how the LLM formats output:

| Preset | Best for |
|--------|----------|
| General | Everyday speech, casual recordings |
| Meeting Notes | Structured notes with action items and decisions |
| Technical | Engineering discussions preserving code refs and API names |
| Interview | Q&A format with bolded skills and metrics |
| Lecture / Podcast | Academic content with headings and key concepts |

## Project Structure

```
ai-transcription-engine/
├── backend/
│   ├── app.py                # FastAPI routes (transcribe, clean, stream)
│   ├── transcription.py      # WhisperModel + AsyncOpenAI streaming
│   ├── system_prompt.txt     # Default LLM system prompt
│   └── pyproject.toml
├── frontend/
│   └── src/
│       ├── App.tsx           # Main component with streaming consumer
│       ├── data/
│       │   └── presets.ts    # Domain preset definitions
│       ├── utils/
│       │   └── export.ts     # Markdown / TXT / JSON export
│       └── components/
│           ├── ExportMenu    # Export dropdown
│           ├── SettingsPanel # Domain selector + LLM toggle
│           └── ...
└── .devcontainer/            # Docker + VS Code devcontainer config
```

## License

MIT
