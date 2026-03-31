from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import List
from uuid import uuid4

from .models import (
    AgentProfile,
    AppCategory,
    Artifact,
    ArtifactKind,
    BootstrapResponse,
    ChatMessage,
    Contact,
    DashboardMetrics,
    FundraiseInvestor,
    FundraisePipeline,
    Goal,
    InvestorRoom,
    KnowledgeSource,
    ModuleKey,
    SkillDefinition,
    TaskRun,
    TaskStatus,
    WorkflowDefinition,
    Workspace,
    WorkspaceApp,
    now_iso,
)
from .persistence import SqlitePersistence
from .runtime import detect_runtime_capabilities


def _artifact_id() -> str:
    return f"artifact-{uuid4().hex[:8]}"


def _task_id() -> str:
    return f"run-{uuid4().hex[:8]}"


def _message_id() -> str:
    return f"msg-{uuid4().hex[:8]}"


def _entity_id(prefix: str) -> str:
    return f"{prefix}-{uuid4().hex[:8]}"


@dataclass
class DemoStore:
    persistence: SqlitePersistence = field(default_factory=SqlitePersistence)
    workspace: Workspace = field(default_factory=lambda: Workspace(
        id="workspace-vxv",
        name="VXV Workspace",
        company_name="VXV Network",
        stage="Founder OS MVP",
        mission="Give founders one AI-native operating layer for strategy, execution, team leverage, and fundraising.",
        primary_kpi="Weekly strategic throughput",
        founder_name="Manav Gupta",
        summary="A unified founder workspace that turns chat, workflows, artifacts, and investor readiness into one operating system.",
    ))
    goals: List[Goal] = field(default_factory=lambda: [
        Goal(
            id="goal-1",
            title="Ship unified founder workspace alpha",
            owner="ChiefOfStaffAgent",
            kpi="Alpha users onboarded",
            due_date="2026-05-15",
            linked_agents=["agent-chief", "agent-growth", "agent-ops"],
            status="In flight",
        ),
        Goal(
            id="goal-2",
            title="Stand up investor readiness surface",
            owner="FundraiseAgent",
            kpi="Investor room completeness",
            due_date="2026-05-30",
            linked_agents=["agent-fundraise", "agent-analyst"],
            status="Planning",
        ),
        Goal(
            id="goal-3",
            title="Codify weekly founder review cadence",
            owner="OpsAgent",
            kpi="Decision latency",
            due_date="2026-04-21",
            linked_agents=["agent-ops", "agent-analyst"],
            status="Ready",
        ),
    ])
    agents: List[AgentProfile] = field(default_factory=lambda: [
        AgentProfile(
            id="agent-chief",
            name="ChiefOfStaffAgent",
            role="Routes founder requests, coordinates other agents, and keeps the operating picture coherent.",
            module=ModuleKey.INBOX,
            model="gpt-5.4",
            tools=["planner", "task router", "workspace memory"],
            budget="$450/month",
            permissions=["delegate", "draft", "summarize"],
            escalation_rule="Escalate when irreversible business decisions or external sends are requested.",
            summary="Front door for the founder OS.",
        ),
        AgentProfile(
            id="agent-research",
            name="ResearchAgent",
            role="Builds market maps, customer briefs, competitor teardowns, and investor research.",
            module=ModuleKey.STRATEGY,
            model="gpt-5.4",
            tools=["web research", "knowledge graph", "brief generator"],
            budget="$320/month",
            permissions=["research", "synthesize"],
            escalation_rule="Escalate when sources conflict or confidence drops below threshold.",
            summary="Turns ambiguity into usable strategic context.",
        ),
        AgentProfile(
            id="agent-growth",
            name="GrowthAgent",
            role="Plans GTM experiments, messaging systems, and outbound campaigns.",
            module=ModuleKey.STRATEGY,
            model="gpt-5.4-mini",
            tools=["campaign planner", "copy lab", "experiment scoring"],
            budget="$250/month",
            permissions=["draft", "score", "recommend"],
            escalation_rule="Escalate before paid spend or outbound launch.",
            summary="Owns learning velocity in the growth loop.",
        ),
        AgentProfile(
            id="agent-ops",
            name="OpsAgent",
            role="Builds repeatable cadences, SOPs, reviews, and operating dashboards.",
            module=ModuleKey.EXECUTION,
            model="gpt-5.4-mini",
            tools=["workflow builder", "checklist engine", "scheduler"],
            budget="$190/month",
            permissions=["draft", "coordinate"],
            escalation_rule="Escalate when workflow changes affect people or spend.",
            summary="Keeps execution rhythmic rather than reactive.",
        ),
        AgentProfile(
            id="agent-fundraise",
            name="FundraiseAgent",
            role="Runs investor targeting, memo drafting, diligence preparation, and follow-through.",
            module=ModuleKey.CAPITAL,
            model="gpt-5.4",
            tools=["investor CRM", "memo drafting", "diligence pack assembler"],
            budget="$390/month",
            permissions=["draft", "organize", "track"],
            escalation_rule="Escalate before any investor-facing send.",
            summary="Makes the capital motion founder-light but high-context.",
        ),
        AgentProfile(
            id="agent-analyst",
            name="AnalystAgent",
            role="Turns raw operational signals into board-grade summaries and investor updates.",
            module=ModuleKey.ARTIFACTS,
            model="gpt-5.4-mini",
            tools=["metric summarizer", "board update builder", "snapshot formatter"],
            budget="$160/month",
            permissions=["summarize", "format"],
            escalation_rule="Escalate when data quality looks incomplete.",
            summary="Keeps artifacts sharp enough to travel.",
        ),
    ])
    skills: List[SkillDefinition] = field(default_factory=lambda: [
        SkillDefinition(
            id="skill-market-synthesis",
            name="Market Synthesis",
            summary="Clusters market signals, competitor moves, and customer evidence into founder-ready context.",
            capability_type="research",
        ),
        SkillDefinition(
            id="skill-deck-review",
            name="Pitch Deck Review",
            summary="Scores narrative clarity, market sizing, and fundraising readiness across deck materials.",
            capability_type="fundraising",
        ),
        SkillDefinition(
            id="skill-diligence-pack",
            name="Diligence Pack Assembly",
            summary="Bundles materials, checklists, and update threads into a shareable investor surface.",
            capability_type="capital",
        ),
        SkillDefinition(
            id="skill-founder-review",
            name="Founder Review Builder",
            summary="Compiles KPIs, blockers, and decisions into a weekly review loop.",
            capability_type="operations",
        ),
        SkillDefinition(
            id="skill-persona-clustering",
            name="Persona Clustering",
            summary="Turns interview transcripts into persona hypotheses, pain maps, and message angles.",
            capability_type="research",
        ),
        SkillDefinition(
            id="skill-hiring-scorecard",
            name="Hiring Scorecard Builder",
            summary="Creates role scorecards and interview rubrics from role briefs and hiring goals.",
            capability_type="hiring",
        ),
    ])
    apps: List[WorkspaceApp] = field(default_factory=lambda: [
        WorkspaceApp(
            id="app-pitch-reviewer",
            title="Pitch Deck Reviewer",
            category=AppCategory.FUNDRAISING,
            module=ModuleKey.CAPITAL,
            summary="Audit fundraising materials against venture benchmarks and narrative clarity checks.",
            skill_ids=["skill-deck-review", "skill-market-synthesis"],
            artifact_outputs=["Investor memo", "Deck audit", "Risk report"],
            status="ready",
            last_run_at="2026-03-31T08:24:00Z",
            featured=True,
        ),
        WorkspaceApp(
            id="app-competitor-analyst",
            title="Competitor Analyst",
            category=AppCategory.STRATEGY,
            module=ModuleKey.STRATEGY,
            summary="Map competitors, positioning drift, and market changes into a decision-ready brief.",
            skill_ids=["skill-market-synthesis"],
            artifact_outputs=["Competitor map", "Feature matrix"],
            status="ready",
            last_run_at="2026-03-31T07:51:00Z",
        ),
        WorkspaceApp(
            id="app-research-synthesizer",
            title="Research Synthesizer",
            category=AppCategory.RESEARCH,
            module=ModuleKey.STRATEGY,
            summary="Turn interviews and field notes into personas, insight clusters, and founder briefs.",
            skill_ids=["skill-persona-clustering", "skill-market-synthesis"],
            artifact_outputs=["Persona matrix", "Research brief"],
            status="ready",
            last_run_at="2026-03-31T07:20:00Z",
        ),
        WorkspaceApp(
            id="app-founder-review",
            title="Weekly Founder Review Builder",
            category=AppCategory.OPERATIONS,
            module=ModuleKey.EXECUTION,
            summary="Compile the weekly operating review with KPIs, blockers, and decisions waiting on the founder.",
            skill_ids=["skill-founder-review"],
            artifact_outputs=["Review agenda", "Action queue"],
            status="ready",
            last_run_at="2026-03-31T07:40:00Z",
        ),
        WorkspaceApp(
            id="app-investor-update",
            title="Investor Update Generator",
            category=AppCategory.FUNDRAISING,
            module=ModuleKey.CAPITAL,
            summary="Generate a founder-grade investor update tied to current metrics, milestones, and asks.",
            skill_ids=["skill-diligence-pack", "skill-founder-review"],
            artifact_outputs=["Investor update", "Metrics snapshot"],
            status="ready",
            last_run_at="2026-03-31T06:50:00Z",
        ),
        WorkspaceApp(
            id="app-hiring-scorecard",
            title="Hiring Scorecard Builder",
            category=AppCategory.HIRING,
            module=ModuleKey.TEAM,
            summary="Create role scorecards, interview prompts, and calibration criteria for key hires.",
            skill_ids=["skill-hiring-scorecard"],
            artifact_outputs=["Hiring scorecard", "Interview kit"],
            status="coming-soon",
        ),
    ])
    knowledge_sources: List[KnowledgeSource] = field(default_factory=lambda: [
        KnowledgeSource(id="ks-1", title="Founder vision memo", source_type="doc", status="Connected", freshness="Today"),
        KnowledgeSource(id="ks-2", title="Customer interview archive", source_type="notes", status="Connected", freshness="2d ago"),
        KnowledgeSource(id="ks-3", title="Investor target list", source_type="crm", status="Connected", freshness="Today"),
    ])
    contacts: List[Contact] = field(default_factory=lambda: [
        Contact(id="contact-1", name="Nadia Lee", category="Investor", company="Signal Peak", relationship_stage="Warm", last_touch="2026-03-30"),
        Contact(id="contact-2", name="Avery Chen", category="Advisor", company="Independent", relationship_stage="Active", last_touch="2026-03-29"),
        Contact(id="contact-3", name="Devon Ray", category="Design Partner", company="Orbit Atlas", relationship_stage="Discovery", last_touch="2026-03-28"),
    ])
    artifacts: List[Artifact] = field(default_factory=lambda: [
        Artifact(
            id="artifact-plan",
            title="Founder OS Alpha Plan",
            kind=ArtifactKind.PLAN,
            module=ModuleKey.STRATEGY,
            updated_at="2026-03-31T07:45:00Z",
            summary="The current alpha scope tying Strategy, Team, Execution, Artifacts, and Capital together.",
            content="""# Founder OS Alpha\n\n## Goal\nLaunch one unified workspace for founders instead of five separate products.\n\n## Wedge\n- Founder-first operating layer\n- Investor-facing room as a secondary surface\n- Agent team orchestrated through one command center\n\n## Near-term milestones\n1. Ship unified shell\n2. Wire task orchestration\n3. Publish investor room\n""",
        ),
        Artifact(
            id="artifact-room",
            title="Investor Room Narrative",
            kind=ArtifactKind.MEMO,
            module=ModuleKey.CAPITAL,
            updated_at="2026-03-31T08:00:00Z",
            summary="High-level investor-facing narrative for the initial product arc.",
            content="""# Investor Room Narrative\n\nVXV is becoming a founder operating system that compresses strategy, execution, and capital readiness into one AI-native workspace.\n\n## Why now\n- Founders are drowning in fragmented AI tools\n- Agent infrastructure is mature enough to unify work\n- Investors increasingly want cleaner reporting and diligence surfaces\n""",
        ),
        Artifact(
            id="artifact-app-review",
            title="Series A Deck Audit",
            kind=ArtifactKind.REPORT,
            module=ModuleKey.APPS,
            updated_at="2026-03-31T08:24:00Z",
            summary="Latest review package generated by the Pitch Deck Reviewer app.",
            content="""# Series A Deck Audit\n\n## Strengths\n- Narrative is sharper around the founder operating system wedge\n- Market sizing is now grounded in clear buyer pain\n- Investor FAQ anticipates diligence questions earlier\n\n## Revisions requested\n1. Tighten the first three slides\n2. Quantify strategic throughput gains with one benchmark\n3. Link the investor room and update cadence more directly\n""",
        ),
    ])
    task_runs: List[TaskRun] = field(default_factory=lambda: [
        TaskRun(
            id="run-brief",
            title="Customer research sprint",
            status=TaskStatus.RUNNING,
            module=ModuleKey.STRATEGY,
            owner_agent_id="agent-research",
            progress_label="Interview synthesis underway",
            trace_summary="ResearchAgent is clustering customer pain points and drafting a founder brief.",
            created_at="2026-03-31T07:20:00Z",
            outputs=["Pain point matrix", "Founder brief"],
        ),
        TaskRun(
            id="run-review",
            title="Weekly founder review",
            status=TaskStatus.WAITING,
            module=ModuleKey.EXECUTION,
            owner_agent_id="agent-ops",
            progress_label="Waiting on approval",
            trace_summary="OpsAgent proposes a Monday review ritual with KPI and decision checkpoints.",
            created_at="2026-03-31T07:40:00Z",
            outputs=["Cadence template"],
            requires_approval=True,
        ),
        TaskRun(
            id="run-capital",
            title="Fundraise readiness audit",
            status=TaskStatus.COMPLETED,
            module=ModuleKey.CAPITAL,
            owner_agent_id="agent-fundraise",
            progress_label="Audit completed",
            trace_summary="FundraiseAgent assembled the missing diligence checklist and investor room outline.",
            created_at="2026-03-31T06:50:00Z",
            outputs=["Investor room checklist", "Round narrative gaps"],
        ),
        TaskRun(
            id="run-app-review",
            title="Pitch Deck Reviewer run",
            status=TaskStatus.RUNNING,
            module=ModuleKey.APPS,
            owner_agent_id="agent-fundraise",
            progress_label="Benchmarking narrative flow",
            trace_summary="Pitch Deck Reviewer is validating story arc, market framing, and investor objections against recent seed decks.",
            created_at="2026-03-31T08:24:00Z",
            outputs=["Deck audit", "Executive summary", "Investor risk report"],
        ),
    ])
    workflows: List[WorkflowDefinition] = field(default_factory=lambda: [
        WorkflowDefinition(
            id="wf-1",
            title="Idea to operating plan",
            module=ModuleKey.STRATEGY,
            description="Turns a raw founder idea into a strategy brief, roadmap, and initial operating cadence.",
            outputs=["Plan", "Roadmap", "Weekly review draft"],
        ),
        WorkflowDefinition(
            id="wf-2",
            title="Weekly founder review",
            module=ModuleKey.EXECUTION,
            description="Generates an agenda, KPI snapshot, blockers, and decisions-to-make list.",
            outputs=["Agenda", "KPI summary", "Action list"],
        ),
        WorkflowDefinition(
            id="wf-3",
            title="Investor update generator",
            module=ModuleKey.CAPITAL,
            description="Produces a tight investor update from recent progress, risks, and asks.",
            outputs=["Update draft", "Metrics callout"],
        ),
        WorkflowDefinition(
            id="wf-4",
            title="Diligence room assembler",
            module=ModuleKey.CAPITAL,
            description="Bundles curated artifacts into a read-only investor room.",
            outputs=["Room index", "FAQ", "Diligence checklist"],
        ),
    ])
    fundraise_pipeline: FundraisePipeline = field(default_factory=lambda: FundraisePipeline(
        id="pipeline-1",
        round_name="Founder OS Seed",
        target_amount="$1.5M",
        status="Warming relationships",
        narrative="Raise against a unified founder workspace wedge, not a family of disconnected AI utilities.",
        investors=[
            FundraiseInvestor(
                id="investor-1",
                name="Signal Peak",
                thesis="Workflow software for modern operators",
                stage_fit="Seed",
                relationship_status="Warm",
                next_step="Send room link after roadmap refresh",
            ),
            FundraiseInvestor(
                id="investor-2",
                name="Northline Ventures",
                thesis="AI-native B2B platforms",
                stage_fit="Seed",
                relationship_status="Researching",
                next_step="Prepare sector memo",
            ),
            FundraiseInvestor(
                id="investor-3",
                name="Canvas Bridge",
                thesis="Future of work infrastructure",
                stage_fit="Pre-seed/Seed",
                relationship_status="Intro pending",
                next_step="Coordinate advisor intro",
            ),
        ],
    ))
    investor_room: InvestorRoom = field(default_factory=lambda: InvestorRoom(
        id="room-1",
        title="VXV Founder OS Investor Room",
        visibility="read-only",
        headline="One AI-native operating layer for founders, with investor clarity baked in.",
        curated_artifact_ids=["artifact-plan", "artifact-room"],
        diligence_items=[
            "Product thesis",
            "Founder workflow map",
            "Operating roadmap",
            "Investor update history",
        ],
        update_feed=[
            "Unified shell scaffold completed",
            "Investor room narrative refreshed",
            "Founder review cadence drafted",
        ],
    ))
    messages: List[ChatMessage] = field(default_factory=lambda: [
        ChatMessage(
            id="msg-1",
            role="assistant",
            author="ChiefOfStaffAgent",
            module=ModuleKey.INBOX,
            created_at="2026-03-31T07:10:00Z",
            content="""## Welcome to VXV Workspace\n\nI can coordinate strategy, team leverage, execution rhythms, artifact production, and fundraising prep from one place.\n\nTry asking for:\n- a founder weekly review\n- a GTM experiment plan\n- an investor memo refresh\n""",
        )
    ])
    disable_persistence: bool = field(default_factory=lambda: os.getenv("VXV_DISABLE_PERSISTENCE") == "1")

    def __post_init__(self) -> None:
        if self.disable_persistence:
            return
        payload = self.persistence.load_state(self.workspace.id)
        if payload:
            self._load(payload)
        else:
            self.persist()

    def _load(self, payload_text: str) -> None:
        payload = json.loads(payload_text)
        self.workspace = Workspace.model_validate(payload["workspace"])
        self.goals = [Goal.model_validate(item) for item in payload["goals"]]
        self.agents = [AgentProfile.model_validate(item) for item in payload["agents"]]
        self.skills = [SkillDefinition.model_validate(item) for item in payload["skills"]]
        self.apps = [WorkspaceApp.model_validate(item) for item in payload["apps"]]
        self.knowledge_sources = [KnowledgeSource.model_validate(item) for item in payload["knowledge_sources"]]
        self.contacts = [Contact.model_validate(item) for item in payload["contacts"]]
        self.artifacts = [Artifact.model_validate(item) for item in payload["artifacts"]]
        self.task_runs = [TaskRun.model_validate(item) for item in payload["task_runs"]]
        self.workflows = [WorkflowDefinition.model_validate(item) for item in payload["workflows"]]
        self.fundraise_pipeline = FundraisePipeline.model_validate(payload["fundraise_pipeline"])
        self.investor_room = InvestorRoom.model_validate(payload["investor_room"])
        self.messages = [ChatMessage.model_validate(item) for item in payload["messages"]]

    def persist(self) -> None:
        if self.disable_persistence:
            return
        payload = {
            "workspace": self.workspace.model_dump(),
            "goals": [item.model_dump() for item in self.goals],
            "agents": [item.model_dump() for item in self.agents],
            "skills": [item.model_dump() for item in self.skills],
            "apps": [item.model_dump() for item in self.apps],
            "knowledge_sources": [item.model_dump() for item in self.knowledge_sources],
            "contacts": [item.model_dump() for item in self.contacts],
            "artifacts": [item.model_dump() for item in self.artifacts],
            "task_runs": [item.model_dump() for item in self.task_runs],
            "workflows": [item.model_dump() for item in self.workflows],
            "fundraise_pipeline": self.fundraise_pipeline.model_dump(),
            "investor_room": self.investor_room.model_dump(),
            "messages": [item.model_dump() for item in self.messages],
        }
        self.persistence.save_state(self.workspace.id, json.dumps(payload, indent=2))

    def metrics(self) -> DashboardMetrics:
        return DashboardMetrics(
            active_goals=len(self.goals),
            running_tasks=len([task for task in self.task_runs if task.status in {TaskStatus.RUNNING, TaskStatus.WAITING}]),
            ready_artifacts=len(self.artifacts),
            warm_investors=len(
                [investor for investor in self.fundraise_pipeline.investors if investor.relationship_status in {"Warm", "Active"}]
            ),
        )

    def bootstrap(self) -> BootstrapResponse:
        return BootstrapResponse(
            workspace=self.workspace,
            goals=self.goals,
            agents=self.agents,
            skills=self.skills,
            apps=self.apps,
            knowledge_sources=self.knowledge_sources,
            contacts=self.contacts,
            artifacts=self.artifacts,
            task_runs=self.task_runs,
            workflows=self.workflows,
            fundraise_pipeline=self.fundraise_pipeline,
            investor_room=self.investor_room,
            messages=self.messages,
            integrations=detect_runtime_capabilities().to_model(),
            metrics=self.metrics(),
        )

    def append_message(self, role: str, author: str, module: ModuleKey, content: str) -> ChatMessage:
        message = ChatMessage(
            id=_message_id(),
            role=role,
            author=author,
            module=module,
            content=content,
            created_at=now_iso(),
        )
        self.messages.append(message)
        self.persist()
        return message

    def upsert_artifact(self, title: str, module: ModuleKey, summary: str, content: str, kind: ArtifactKind, linked_run_id: str) -> Artifact:
        existing = next((artifact for artifact in self.artifacts if artifact.title == title), None)
        updated_at = now_iso()
        if existing:
            existing.module = module
            existing.summary = summary
            existing.content = content
            existing.kind = kind
            existing.updated_at = updated_at
            existing.linked_run_id = linked_run_id
            self.persist()
            return existing
        artifact = Artifact(
            id=_artifact_id(),
            title=title,
            kind=kind,
            module=module,
            updated_at=updated_at,
            summary=summary,
            content=content,
            linked_run_id=linked_run_id,
        )
        self.artifacts.insert(0, artifact)
        self.persist()
        return artifact

    def add_task_run(
        self,
        title: str,
        module: ModuleKey,
        owner_agent_id: str,
        progress_label: str,
        trace_summary: str,
        outputs: List[str],
        requires_approval: bool = False,
        status: TaskStatus = TaskStatus.RUNNING,
    ) -> TaskRun:
        task = TaskRun(
            id=_task_id(),
            title=title,
            status=status,
            module=module,
            owner_agent_id=owner_agent_id,
            progress_label=progress_label,
            trace_summary=trace_summary,
            created_at=now_iso(),
            outputs=outputs,
            requires_approval=requires_approval,
        )
        self.task_runs.insert(0, task)
        self.persist()
        return task

    def get_artifact(self, artifact_id: str) -> Artifact:
        artifact = next((item for item in self.artifacts if item.id == artifact_id), None)
        if artifact is None:
            raise KeyError(f"Unknown artifact: {artifact_id}")
        return artifact

    def get_task_run(self, task_id: str) -> TaskRun:
        task = next((item for item in self.task_runs if item.id == task_id), None)
        if task is None:
            raise KeyError(f"Unknown task run: {task_id}")
        return task

    def get_app(self, app_id: str) -> WorkspaceApp:
        app = next((item for item in self.apps if item.id == app_id), None)
        if app is None:
            raise KeyError(f"Unknown app: {app_id}")
        return app

    def get_goal(self, goal_id: str) -> Goal:
        goal = next((item for item in self.goals if item.id == goal_id), None)
        if goal is None:
            raise KeyError(f"Unknown goal: {goal_id}")
        return goal

    def get_agent(self, agent_id: str) -> AgentProfile:
        agent = next((item for item in self.agents if item.id == agent_id), None)
        if agent is None:
            raise KeyError(f"Unknown agent: {agent_id}")
        return agent

    def get_workflow(self, workflow_id: str) -> WorkflowDefinition:
        workflow = next((item for item in self.workflows if item.id == workflow_id), None)
        if workflow is None:
            raise KeyError(f"Unknown workflow: {workflow_id}")
        return workflow

    def get_fundraise_investor(self, investor_id: str) -> FundraiseInvestor:
        investor = next((item for item in self.fundraise_pipeline.investors if item.id == investor_id), None)
        if investor is None:
            raise KeyError(f"Unknown fundraise investor: {investor_id}")
        return investor

    def update_workspace(
        self,
        *,
        company_name: str,
        founder_name: str,
        stage: str,
        mission: str,
        primary_kpi: str,
        summary: str,
    ) -> Workspace:
        self.workspace.company_name = company_name
        self.workspace.founder_name = founder_name
        self.workspace.stage = stage
        self.workspace.mission = mission
        self.workspace.primary_kpi = primary_kpi
        self.workspace.summary = summary
        self.persist()
        return self.workspace

    def add_goal(
        self,
        *,
        title: str,
        owner: str,
        kpi: str,
        due_date: str,
        linked_agents: List[str],
        status: str,
    ) -> Goal:
        goal = Goal(
            id=_entity_id("goal"),
            title=title,
            owner=owner,
            kpi=kpi,
            due_date=due_date,
            linked_agents=linked_agents,
            status=status,
        )
        self.goals.insert(0, goal)
        self.persist()
        return goal

    def update_goal_status(self, goal_id: str, status: str) -> Goal:
        goal = self.get_goal(goal_id)
        goal.status = status
        self.persist()
        return goal

    def add_knowledge_source(self, *, title: str, source_type: str, status: str, freshness: str) -> KnowledgeSource:
        source = KnowledgeSource(
            id=_entity_id("ks"),
            title=title,
            source_type=source_type,
            status=status,
            freshness=freshness,
        )
        self.knowledge_sources.insert(0, source)
        self.persist()
        return source

    def update_agent(self, *, agent_id: str, budget: str, permissions: List[str], escalation_rule: str) -> AgentProfile:
        agent = self.get_agent(agent_id)
        agent.budget = budget
        agent.permissions = permissions
        agent.escalation_rule = escalation_rule
        self.persist()
        return agent

    def add_contact(
        self,
        *,
        name: str,
        category: str,
        company: str,
        relationship_stage: str,
        last_touch: str,
    ) -> Contact:
        contact = Contact(
            id=_entity_id("contact"),
            name=name,
            category=category,
            company=company,
            relationship_stage=relationship_stage,
            last_touch=last_touch,
        )
        self.contacts.insert(0, contact)
        self.persist()
        return contact

    def add_fundraise_investor(
        self,
        *,
        name: str,
        thesis: str,
        stage_fit: str,
        relationship_status: str,
        next_step: str,
    ) -> FundraiseInvestor:
        investor = FundraiseInvestor(
            id=_entity_id("investor"),
            name=name,
            thesis=thesis,
            stage_fit=stage_fit,
            relationship_status=relationship_status,
            next_step=next_step,
        )
        self.fundraise_pipeline.investors.insert(0, investor)
        self.contacts.insert(
            0,
            Contact(
                id=_entity_id("contact"),
                name=name,
                category="Investor",
                company=self.workspace.company_name,
                relationship_stage=relationship_status,
                last_touch=now_iso().split("T", 1)[0],
            ),
        )
        self.persist()
        return investor

    def update_fundraise_investor(self, *, investor_id: str, relationship_status: str, next_step: str) -> FundraiseInvestor:
        investor = self.get_fundraise_investor(investor_id)
        investor.relationship_status = relationship_status
        investor.next_step = next_step
        for contact in self.contacts:
            if contact.name == investor.name and contact.category == "Investor":
                contact.relationship_stage = relationship_status
                contact.last_touch = now_iso().split("T", 1)[0]
                break
        self.persist()
        return investor

    def ingest_upload(
        self,
        *,
        title: str,
        module: ModuleKey,
        source_type: str,
        extracted_text: str,
        linked_run_id: str | None = None,
    ) -> tuple[KnowledgeSource, Artifact]:
        source = self.add_knowledge_source(
            title=title,
            source_type=source_type,
            status="Connected",
            freshness="Today",
        )
        artifact = self.upsert_artifact(
            title=f"{title} Ingestion",
            module=module,
            summary=f"Ingested document available to the workspace from {title}.",
            content=(
                f"# {title}\n\n"
                "## Extracted context\n"
                f"{extracted_text[:6000] or 'No text could be extracted from the upload yet.'}\n"
            ),
            kind=ArtifactKind.BRIEF,
            linked_run_id=linked_run_id or _task_id(),
        )
        return source, artifact

    def update_artifact_content(self, artifact_id: str, content: str) -> Artifact:
        artifact = self.get_artifact(artifact_id)
        artifact.content = content
        artifact.updated_at = now_iso()
        self.persist()
        return artifact

    def publish_investor_room(self, artifact_id: str | None = None) -> InvestorRoom:
        chosen_artifact_id = artifact_id
        if chosen_artifact_id is None:
            capital_artifact = next((artifact for artifact in self.artifacts if artifact.module == ModuleKey.CAPITAL), None)
            chosen_artifact_id = capital_artifact.id if capital_artifact else None

        if chosen_artifact_id and chosen_artifact_id not in self.investor_room.curated_artifact_ids:
            self.investor_room.curated_artifact_ids.insert(0, chosen_artifact_id)

        self.investor_room.visibility = "read-only"
        self.investor_room.update_feed.insert(0, f"Investor room refreshed at {now_iso()}")
        self.investor_room.update_feed = self.investor_room.update_feed[:6]
        self.persist()
        return self.investor_room
