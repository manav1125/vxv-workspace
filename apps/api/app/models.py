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


class ChatResponse(BaseModel):
    reply: ChatMessage
    active_agent: AgentProfile
    task_run: TaskRun
    artifact: Artifact
    suggestions: List[str]
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


def now_iso() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
