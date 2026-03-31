<<<<<<< HEAD
# VXV Workspace

Unified founder operating system scaffold built on the AgentScope ecosystem.

## What is here

- `apps/web`: Vite + React frontend for the founder workspace shell.
- `apps/api`: FastAPI backend with founder-focused entities, demo orchestration, and AgentScope-ready integration seams.

## Product shape

The current implementation collapses the VXV product family into one authenticated workspace with seven modules:

- `Inbox`: approvals, interruptions, notifications, founder command center
- `Strategy`: goals, plans, market research, roadmaps
- `Team`: agent roster, roles, budgets, guardrails
- `Execution`: runs, cadences, automations, workflow status
- `Artifacts`: plans, memos, investor updates, research documents
- `Capital`: fundraising pipeline and investor room
- `Apps`: immersive workflow tools that use skills and generate artifacts

## Frontend foundation

The web app now includes:

- a dark editorial `VXV Workspace` shell aligned to the final Stitch direction
- founder-first module surfaces for inbox, strategy, team, execution, artifacts, capital, and apps
- an internal app library plus immersive app run view
- artifact preview/edit workflows, approval handling, and investor-room rendering
- `@agentscope-ai/design` and `@agentscope-ai/chat` where they help without forcing the whole UI into a generic chatbot shell

## Backend foundation

The API exposes the product entities we want to preserve long-term:

- `Workspace`
- `Goal`
- `AgentProfile`
- `SkillDefinition`
- `WorkspaceApp`
- `TaskRun`
- `Artifact`
- `KnowledgeSource`
- `Contact`
- `FundraisePipeline`
- `InvestorRoom`

The demo orchestration layer is intentionally thin. It already separates:

- product-facing API routes
- domain models
- in-memory store
- runtime integration detection

It also now supports basic stateful founder actions:

- launch an app into a tracked run
- save artifact edits through the API
- approve, revise, or reject approval-gated runs

When optional runtime dependencies and model credentials are present, the
chat path can also use a real AgentScope `DialogAgent` instead of the fallback
template response layer.

That means we can replace the demo orchestrator with AgentScope Runtime execution without rewriting the frontend contract.

## Run the web app

```bash
npm install
npm run dev:web
```

The Vite dev server proxies `/api` requests to `http://127.0.0.1:8000`.

## Run the API

```bash
cd apps/api
python3 -m venv .venv
source .venv/bin/activate
python3 -m pip install ".[dev]"
uvicorn app.main:app --reload
```

To add the published AgentScope and ReMe Python packages as optional local integrations:

```bash
python3 -m pip install ".[agents]"
```

To enable live AgentScope dialog execution, set one of these provider configs
before running the API:

```bash
export OPENAI_API_KEY=...
export OPENAI_MODEL=gpt-4o-mini
```

Supported providers in the current adapter:

- `OPENAI_API_KEY`
- `ANTHROPIC_API_KEY`
- `DASHSCOPE_API_KEY`

## Verify the API

```bash
cd apps/api
source .venv/bin/activate
pytest
```

## Render deployment

The repo now includes a starter Blueprint at `render.yaml` for a two-service
Render setup:

- `vxv-workspace-api`: FastAPI web service
- `vxv-workspace-web`: static Vite frontend

Before this can be deployed on Render, the project needs to live in a GitHub,
GitLab, or Bitbucket repository because Render Blueprints are Git-backed.

The intended environment variables are:

- API service:
  - `CORS_ORIGINS`
  - one model provider key such as `OPENAI_API_KEY`
- Web service:
  - `VITE_API_BASE_URL` set to the public URL of the API service

Today this is best treated as a staging deployment, because the backend store is
still in-memory and resets on restart or redeploy.

## Notes

- `agentscope-runtime` is treated as the production runtime target even though it is not currently installed from PyPI here.
- The API reports whether optional `agentscope` and `reme` imports are available so the UI can make that status visible.
=======
# vxv-workspace
>>>>>>> 498ef06959f9e4a3dded9bc782c064edc06a5bfe
