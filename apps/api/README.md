# VXV Workspace API

FastAPI backend for the unified founder workspace.

This backend ships in demo mode first, with deliberate seams for:

- AgentScope agent registration and orchestration
- AgentScope Runtime task execution and streaming
- ReMe-backed memory

The current in-memory implementation is good enough to drive the frontend shell while we harden the real runtime integration.

## Local install

```bash
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install ".[dev]"
```
