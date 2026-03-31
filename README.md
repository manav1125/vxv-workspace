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
- session-based login against the API
- workspace user management for owners, including role and status updates
- artifact preview/edit workflows, approval handling, and investor-room rendering
- real upload flow in the app surface that ingests documents into workspace memory
- a lighter markdown rendering path that keeps the frontend bundle small enough for real staging use

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

- authenticate into a workspace session
- create additional workspace users and manage roles/status
- launch an app into a tracked run
- save artifact edits through the API
- approve, revise, or reject approval-gated runs
- update workspace setup and founder operating context
- create and update strategic goals
- connect knowledge sources
- update agent budgets, permissions, and escalation rules
- launch workflows into tracked runs and artifacts
- add and update investor pipeline entries
- add broader relationship contacts into the workspace CRM layer
- upload documents into workspace memory and convert them into artifacts when possible
- persist uploads in either local disk or S3-compatible object storage

When optional runtime dependencies and model credentials are present, the
chat path can also use a real AgentScope `DialogAgent` instead of the fallback
template response layer. The same runtime adapter now powers workflow and app
artifact generation when model credentials are present.

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

## Default login

The API now uses session auth for `/api/*` routes other than the login endpoint.

Default seeded credentials:

```bash
email: founder@vxv.network
password: vxv-demo
```

Override them with:

```bash
export VXV_ADMIN_EMAIL=...
export VXV_ADMIN_PASSWORD=...
export VXV_ADMIN_NAME=...
```

For an external auth provider or reverse proxy, you can switch to trusted
header mode:

```bash
export VXV_AUTH_MODE=trusted-header
export VXV_TRUSTED_EMAIL_HEADER=X-Forwarded-Email
export VXV_TRUSTED_NAME_HEADER=X-Forwarded-User
export VXV_TRUSTED_ROLE_HEADER=X-Forwarded-Role
```

For direct bearer-token validation against an external identity provider, you can
also use OIDC mode:

```bash
export VXV_AUTH_MODE=oidc
export VXV_OIDC_ISSUER=https://your-provider.example.com/
export VXV_OIDC_AUDIENCE=vxv-workspace
export VXV_OIDC_JWKS_URL=https://your-provider.example.com/.well-known/jwks.json
```

Optional OIDC tuning:

- `VXV_OIDC_EMAIL_CLAIM`
- `VXV_OIDC_NAME_CLAIM`
- `VXV_OIDC_ROLE_CLAIM`
- `VXV_OIDC_DEFAULT_ROLE`
- `VXV_OIDC_SHARED_SECRET` for simpler HS256 proxy tokens in non-production setups

The persistence layer now supports either:

- local SQLite via `VXV_DB_PATH`
- managed Postgres via `DATABASE_URL`

The upload storage layer now supports either:

- local disk via `VXV_UPLOAD_DIR`
- S3-compatible object storage via:
  - `VXV_STORAGE_MODE=s3`
  - `VXV_S3_BUCKET`
  - `VXV_S3_PREFIX`
  - `VXV_S3_ENDPOINT_URL`
  - `VXV_S3_PUBLIC_BASE_URL`

The ingestion pipeline currently extracts text from:

- `.txt`, `.md`, `.json`, `.csv`
- `.pdf`
- `.docx`
- `.pptx`
- `.xlsx`
- `.html`

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
  - `DATABASE_URL`
  - one model provider key such as `OPENAI_API_KEY`
  - optional auth mode settings such as `VXV_AUTH_MODE`
  - optional object storage settings such as `VXV_STORAGE_MODE`
- Web service:
  - `VITE_API_BASE_URL` set to the public URL of the API service

Today this is best treated as a staging deployment unless you also provide a
managed Postgres database and non-ephemeral upload storage. The codebase now
supports both, but Render still needs those environment variables/resources
configured for a true production deployment.

## Notes

- `agentscope-runtime` is treated as the production runtime target even though it is not currently installed from PyPI here.
- The API reports whether optional `agentscope` and `reme` imports are available so the UI can make that status visible.
