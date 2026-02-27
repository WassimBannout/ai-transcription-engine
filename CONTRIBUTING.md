# Contributing to VoiceScript AI

Thanks for your interest in contributing! This document covers everything you need to get the project running locally and submit a pull request.

## Development environment

The project ships with a VS Code Dev Container that handles all dependencies automatically.

**Requirements:**
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (4 GB RAM recommended)
- [VS Code](https://code.visualstudio.com/) with the [Dev Containers](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers) extension

**Setup:**
```bash
git clone https://github.com/YOUR_USERNAME/ai-transcription-engine.git
cd ai-transcription-engine
code .
# VS Code will prompt: "Reopen in Container" — click it
```

The container installs Python and Node dependencies, downloads the Ollama model (~2 GB on first run), and creates a `backend/.env` from `.env.example` automatically.

## Running the app

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

## Linting & formatting

Before submitting a PR, make sure all checks pass.

**Backend:**
```bash
# Lint
uvx ruff check backend/

# Format check
uvx ruff format --check backend/
```

**Frontend:**
```bash
cd frontend

# Type-check
npm run type-check

# Lint
npm run lint

# Format check
npm run format:check

# Auto-fix formatting
npm run format
```

These same checks run automatically in CI on every push and pull request.

## Submitting a pull request

1. Fork the repository and create a branch from `main`.
2. Make your changes and ensure all lint/type-check commands pass.
3. Open a PR against `main` and fill in the PR template.
4. A maintainer will review and merge.

## Reporting issues

Use the GitHub issue templates:
- **Bug report** — for unexpected behavior
- **Feature request** — for ideas and improvements

Please search existing issues before opening a new one.
