from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import List, Optional

from pydantic import BaseModel, Field


class ModuleKey(str, Enum):
    INBOX = "inbox"
    STRATEGY = "strategy"
    TEAM = "team"
    EXECUTION = "execution"
    ARTIFACTS = "artifacts"
    CAPITAL = "capital"
    APPS = "apps"


class TaskStatus(str, Enum):
    QUEUED = "queued"
    RUNNING = "running"
    WAITING = "waiting"
    COMPLETED = "completed"
    REJECTED = "rejected"


class ArtifactKind(str, Enum):
    PLAN = "plan"
    MEMO = "memo"
    REPORT = "report"
    BRIEF = "brief"
    DECK = "deck"
    CRM = "crm"


class AppCategory(str, Enum):
    STRATEGY = "strategy"
    GROWTH = "growth"
    OPERATIONS = "operations"
    FUNDRAISING = "fundraising"
    HIRING = "hiring"
    RESEARCH = "research"


class ApprovalDecision(str, Enum):
    APPROVE = "approve"
    REQUEST_REVISION = "request_revision"
    REJECT = "reject"


class Workspace(BaseModel):
    id: str
    name: str
    company_name: str
    stage: str
    mission: str
    primary_kpi: str
    founder_name: str
    summary: str


class Goal(BaseModel):
    id: str
    title: str
    owner: str
    kpi: str
    due_date: str
    linked_agents: List[str]
    status: str


class AgentProfile(BaseModel):
    id: str
    name: str
    role: str
    module: ModuleKey
    model: str
    tools: List[str]
    budget: str
    permissions: List[str]
    escalation_rule: str
    summary: str


class KnowledgeSource(BaseModel):
    id: str
    title: str
    source_type: str
    status: str
    freshness: str


class Contact(BaseModel):
    id: str
    name: str
    category: str
    company: str
    relationship_stage: str
    last_touch: str


class WorkspaceUser(BaseModel):
    email: str
    workspace_id: str
    display_name: str
    role: str
    status: str = "active"
    created_at: Optional[str] = None
    last_login_at: Optional[str] = None


class UploadRecord(BaseModel):
    id: str
    workspace_id: str
    filename: str
    stored_path: str
    storage_backend: str
    storage_url: Optional[str] = None
    content_type: Optional[str] = None
    created_at: str


class Artifact(BaseModel):
    id: str
    title: str
    kind: ArtifactKind
    module: ModuleKey
    updated_at: str
    summary: str
    content: str
    linked_run_id: Optional[str] = None


class TaskRun(BaseModel):
    id: str
    title: str
    status: TaskStatus
    module: ModuleKey
    owner_agent_id: str
    progress_label: str
    trace_summary: str
    created_at: str
    outputs: List[str]
    requires_approval: bool = False


class FundraiseInvestor(BaseModel):
    id: str
    name: str
    thesis: str
    stage_fit: str
    relationship_status: str
    next_step: str


class FundraisePipeline(BaseModel):
    id: str
    round_name: str
    target_amount: str
    status: str
    narrative: str
    investors: List[FundraiseInvestor]


class InvestorRoom(BaseModel):
    id: str
    title: str
    visibility: str
    headline: str
    curated_artifact_ids: List[str]
    diligence_items: List[str]
    update_feed: List[str]


class ChatMessage(BaseModel):
    id: str
    role: str
    author: str
    module: ModuleKey
    content: str
    created_at: str


class WorkflowDefinition(BaseModel):
    id: str
    title: str
    module: ModuleKey
    description: str
    outputs: List[str]


class SkillDefinition(BaseModel):
    id: str
    name: str
    summary: str
    capability_type: str


class WorkspaceApp(BaseModel):
    id: str
    title: str
    category: AppCategory
    module: ModuleKey
    summary: str
    skill_ids: List[str]
    artifact_outputs: List[str]
    status: str
    last_run_at: Optional[str] = None
    featured: bool = False


class IntegrationStatus(BaseModel):
    agentscope_python_available: bool
    agentscope_configured: bool
    reme_available: bool
    runtime_target: str
    mode: str
    runtime_provider: Optional[str] = None
    runtime_reason: Optional[str] = None


class DashboardMetrics(BaseModel):
    active_goals: int
    running_tasks: int
    ready_artifacts: int
    warm_investors: int


class BootstrapResponse(BaseModel):
    workspace: Workspace
    goals: List[Goal]
    agents: List[AgentProfile]
    skills: List[SkillDefinition]
    apps: List[WorkspaceApp]
    knowledge_sources: List[KnowledgeSource]
    contacts: List[Contact]
    artifacts: List[Artifact]
    task_runs: List[TaskRun]
    workflows: List[WorkflowDefinition]
    fundraise_pipeline: FundraisePipeline
    investor_room: InvestorRoom
    messages: List[ChatMessage]
    integrations: IntegrationStatus
    metrics: DashboardMetrics


class ChatRequest(BaseModel):
    module: ModuleKey
    message: str = Field(min_length=1, max_length=4000)
    selected_artifact_id: Optional[str] = None


class WorkspaceSetupRequest(BaseModel):
    company_name: str = Field(min_length=1, max_length=120)
    founder_name: str = Field(min_length=1, max_length=120)
    stage: str = Field(min_length=1, max_length=80)
    mission: str = Field(min_length=1, max_length=400)
    primary_kpi: str = Field(min_length=1, max_length=120)
    summary: str = Field(min_length=1, max_length=500)


class GoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    owner: str = Field(min_length=1, max_length=120)
    kpi: str = Field(min_length=1, max_length=160)
    due_date: str = Field(min_length=1, max_length=40)
    linked_agents: List[str] = Field(default_factory=list)
    status: str = Field(default="Planned", min_length=1, max_length=60)


class GoalUpdateRequest(BaseModel):
    status: str = Field(min_length=1, max_length=60)


class KnowledgeSourceCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    source_type: str = Field(min_length=1, max_length=80)
    status: str = Field(default="Connected", min_length=1, max_length=80)
    freshness: str = Field(default="Today", min_length=1, max_length=80)


class AgentUpdateRequest(BaseModel):
    budget: str = Field(min_length=1, max_length=80)
    permissions: List[str] = Field(default_factory=list)
    escalation_rule: str = Field(min_length=1, max_length=240)


class ContactCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=80)
    company: str = Field(min_length=1, max_length=120)
    relationship_stage: str = Field(min_length=1, max_length=80)
    last_touch: Optional[str] = Field(default=None, max_length=40)


class FundraiseInvestorCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    thesis: str = Field(min_length=1, max_length=200)
    stage_fit: str = Field(min_length=1, max_length=80)
    relationship_status: str = Field(min_length=1, max_length=80)
    next_step: str = Field(min_length=1, max_length=200)


class FundraiseInvestorUpdateRequest(BaseModel):
    relationship_status: str = Field(min_length=1, max_length=80)
    next_step: str = Field(min_length=1, max_length=200)


class WorkflowLaunchRequest(BaseModel):
    note: str = Field(min_length=1, max_length=4000)


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=3, max_length=200)


class AuthSession(BaseModel):
    token: str
    email: str
    workspace_id: str
    display_name: str
    role: str


class WorkspaceUserCreateRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=8, max_length=200)
    display_name: str = Field(min_length=1, max_length=120)
    role: str = Field(min_length=1, max_length=60)


class WorkspaceUserUpdateRequest(BaseModel):
    display_name: Optional[str] = Field(default=None, min_length=1, max_length=120)
    role: Optional[str] = Field(default=None, min_length=1, max_length=60)
    status: Optional[str] = Field(default=None, min_length=1, max_length=60)
    password: Optional[str] = Field(default=None, min_length=8, max_length=200)


class ChatResponse(BaseModel):
    reply: ChatMessage
    active_agent: AgentProfile
    task_run: TaskRun
    artifact: Artifact
    suggestions: List[str]
    routed_module: ModuleKey
    context_items: List[str]
    next_actions: List[str]
    launched_app_id: Optional[str] = None
    updated_metrics: DashboardMetrics


class ArtifactUpdateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=20000)


class ApprovalRequest(BaseModel):
    decision: ApprovalDecision


class AppLaunchRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


class PublishInvestorRoomRequest(BaseModel):
    artifact_id: Optional[str] = None


class ActionResponse(BaseModel):
    task_run: TaskRun
    artifact: Optional[Artifact] = None
    message: str


class InvestorRoomActionResponse(BaseModel):
    investor_room: InvestorRoom
    message: str


class UploadResponse(BaseModel):
    upload: UploadRecord
    knowledge_source: KnowledgeSource
    artifact: Artifact
    message: str


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
