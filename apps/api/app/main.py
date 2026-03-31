from __future__ import annotations

import os

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .models import (
    ActionResponse,
    AppLaunchRequest,
    ApprovalRequest,
    Artifact,
    ArtifactUpdateRequest,
    BootstrapResponse,
    ChatRequest,
    ChatResponse,
    InvestorRoomActionResponse,
    PublishInvestorRoomRequest,
)
from .orchestrator import FounderOrchestrator
from .store import DemoStore

app = FastAPI(
    title="VXV Workspace API",
    version="0.1.0",
    summary="Unified founder OS scaffold aligned to the AgentScope ecosystem.",
)

cors_origins_env = os.getenv("CORS_ORIGINS", "*").strip()
cors_origins = ["*"] if cors_origins_env in {"", "*"} else [
    origin.strip() for origin in cors_origins_env.split(",") if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=cors_origins != ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

store = DemoStore()
orchestrator = FounderOrchestrator(store)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/bootstrap", response_model=BootstrapResponse)
def get_bootstrap() -> BootstrapResponse:
    return store.bootstrap()


@app.get("/api/workspaces/current")
def get_workspace():
    return store.workspace


@app.get("/api/goals")
def get_goals():
    return store.goals


@app.get("/api/agents")
def get_agents():
    return store.agents


@app.get("/api/skills")
def get_skills():
    return store.skills


@app.get("/api/apps")
def get_apps():
    return store.apps


@app.get("/api/task-runs")
def get_task_runs():
    return store.task_runs


@app.get("/api/artifacts")
def get_artifacts():
    return store.artifacts


@app.patch("/api/artifacts/{artifact_id}", response_model=Artifact)
def patch_artifact(artifact_id: str, request: ArtifactUpdateRequest) -> Artifact:
    try:
        return store.update_artifact_content(artifact_id, request.content)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/api/contacts")
def get_contacts():
    return store.contacts


@app.get("/api/workflows")
def get_workflows():
    return store.workflows


@app.get("/api/fundraise-pipeline/current")
def get_fundraise_pipeline():
    return store.fundraise_pipeline


@app.get("/api/investor-room/current")
def get_investor_room():
    return store.investor_room


@app.post("/api/task-runs/{task_id}/approval", response_model=ActionResponse)
def post_task_approval(task_id: str, request: ApprovalRequest) -> ActionResponse:
    try:
        return orchestrator.decide_approval(task_id, request.decision)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/apps/{app_id}/launch", response_model=ActionResponse)
def post_app_launch(app_id: str, request: AppLaunchRequest) -> ActionResponse:
    try:
        return orchestrator.launch_app(app_id, request)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/chat", response_model=ChatResponse)
def post_chat(request: ChatRequest) -> ChatResponse:
    return orchestrator.respond(request)


@app.post("/api/investor-room/publish", response_model=InvestorRoomActionResponse)
def post_publish_investor_room(request: PublishInvestorRoomRequest) -> InvestorRoomActionResponse:
    return orchestrator.publish_investor_room(request)
