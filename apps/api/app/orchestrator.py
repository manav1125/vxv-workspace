from __future__ import annotations

from typing import Tuple

from .models import (
    ActionResponse,
    AppLaunchRequest,
    ApprovalDecision,
    ArtifactKind,
    ChatRequest,
    ChatResponse,
    InvestorRoomActionResponse,
    MemoryItem,
    ModuleKey,
    PublishInvestorRoomRequest,
    TaskStatus,
    ThreadNode,
    WorkflowLaunchRequest,
)
from .runtime import AgentScopeRuntimeAdapter
from .store import DemoStore


class FounderOrchestrator:
    def __init__(self, store: DemoStore) -> None:
        self.store = store
        self.runtime = AgentScopeRuntimeAdapter()

    def _select_agent(self, request: ChatRequest):
        module_map = {
            ModuleKey.INBOX: "agent-chief",
            ModuleKey.STRATEGY: "agent-research",
            ModuleKey.TEAM: "agent-chief",
            ModuleKey.EXECUTION: "agent-ops",
            ModuleKey.ARTIFACTS: "agent-analyst",
            ModuleKey.CAPITAL: "agent-fundraise",
            ModuleKey.APPS: "agent-chief",
        }

        text = request.message.lower()
        if any(keyword in text for keyword in ["investor", "fundraise", "diligence", "memo", "deck", "pitch"]):
            agent_id = "agent-fundraise"
        elif any(keyword in text for keyword in ["gtm", "growth", "campaign", "customer"]):
            agent_id = "agent-growth"
        elif any(keyword in text for keyword in ["cadence", "ops", "workflow", "review"]):
            agent_id = "agent-ops"
        elif any(keyword in text for keyword in ["board", "artifact", "summary", "report"]):
            agent_id = "agent-analyst"
        else:
            agent_id = module_map[request.module]

        return next(agent for agent in self.store.agents if agent.id == agent_id)

    def _artifact_template(self, request: ChatRequest) -> Tuple[str, str, str, ArtifactKind]:
        message = request.message.strip()
        lowered = message.lower()

        if request.module == ModuleKey.CAPITAL or "investor" in lowered or "fundraise" in lowered:
            title = "Investor Memo Refresh"
            summary = "Fresh investor-facing narrative tied to the unified founder operating system."
            content = f"""# Investor Memo Refresh\n\n## Ask\n{message}\n\n## Updated narrative\n- VXV is consolidating founder workflows into one operating layer\n- The product now unifies strategy, execution, team leverage, and capital readiness\n- Investor-facing access becomes a curated surface rather than a separate product\n\n## Next actions\n1. Tighten the round narrative around founder throughput\n2. Link the latest roadmap and traction snapshot\n3. Publish a refreshed investor room index\n"""
            return title, summary, content, ArtifactKind.MEMO

        if request.module == ModuleKey.APPS or "deck" in lowered or "reviewer" in lowered:
            title = "App Run Output"
            summary = "Artifact generated from an immersive workflow app inside the workspace."
            content = f"""# App Run Output\n\n## Trigger\n{message}\n\n## App-layer interpretation\n- The request was routed through a workflow app surface rather than plain chat\n- Skills were composed behind the scenes and traced into one run\n- Outputs are saved back into the shared artifact layer\n\n## Suggested next moves\n1. Review the generated artifact\n2. Approve any outbound action if required\n3. Publish the final output to the right workspace surface\n"""
            return title, summary, content, ArtifactKind.REPORT

        if request.module == ModuleKey.EXECUTION or "cadence" in lowered or "workflow" in lowered:
            title = "Weekly Founder Review Cadence"
            summary = "Operating cadence draft for the founder command loop."
            content = f"""# Weekly Founder Review Cadence\n\n## Trigger\n{message}\n\n## Monday review structure\n- KPI pulse\n- Decisions waiting on the founder\n- Risks that need intervention\n- Delegations that can move to agents\n\n## Output\n- One executive summary\n- One execution queue\n- One investor-facing snapshot when relevant\n"""
            return title, summary, content, ArtifactKind.PLAN

        if request.module == ModuleKey.ARTIFACTS or "brief" in lowered or "report" in lowered:
            title = "Founder Brief"
            summary = "Clean artifact generated from founder request."
            content = f"""# Founder Brief\n\n## Prompt\n{message}\n\n## What changed\n- Converted the request into a reusable artifact\n- Structured it for downstream review and sharing\n- Preserved a trace back to the originating run\n"""
            return title, summary, content, ArtifactKind.BRIEF

        title = "Unified Operating Plan"
        summary = "Strategy plan created from the founder request."
        content = f"""# Unified Operating Plan\n\n## Founder request\n{message}\n\n## Plan shape\n- Clarify the strategic goal\n- Assign the right agent owners\n- Generate artifacts and cadences off the same operating spine\n\n## Recommended next moves\n1. Lock the wedge\n2. Choose the next operating workflow\n3. Publish the artifact into the shared workspace\n"""
        return title, summary, content, ArtifactKind.PLAN

    def _pick_app_id(self, request: ChatRequest) -> str | None:
        lowered = request.message.lower()
        if any(keyword in lowered for keyword in ["deck", "pitch", "memo", "investor update"]):
            return "app-pitch-reviewer"
        if any(keyword in lowered for keyword in ["customer", "interview", "persona"]):
            return "app-customer-research"
        if any(keyword in lowered for keyword in ["founder review", "weekly review", "cadence"]):
            return "app-founder-review"
        return None

    def _context_items(self, request: ChatRequest, artifact_title: str) -> list[str]:
        context = [
            f"Workspace mission: {self.store.workspace.mission}",
            f"Primary KPI: {self.store.workspace.primary_kpi}",
        ]
        context.extend(
            f"Goal: {goal.title} ({goal.status})" for goal in self.store.goals[:2]
        )
        context.extend(
            f"Knowledge: {source.title} [{source.source_type}]"
            for source in self.store.knowledge_sources[:2]
        )
        context.append(f"Active artifact: {artifact_title}")
        if request.selected_artifact_id:
            selected = next(
                (artifact for artifact in self.store.artifacts if artifact.id == request.selected_artifact_id),
                None,
            )
            if selected is not None:
                context.append(f"Founder referenced artifact: {selected.title}")
        return context

    def _memory_hits(self, request: ChatRequest, artifact) -> list[MemoryItem]:
        hits: list[MemoryItem] = [
            MemoryItem(
                id=f"memory-active-artifact-{artifact.id}",
                title=artifact.title,
                summary=artifact.summary,
                kind="artifact",
                updated_at=artifact.updated_at,
                source_id=artifact.id,
                pinned=True,
            )
        ]
        hits.extend(
            MemoryItem(
                id=f"memory-hit-{goal.id}",
                title=goal.title,
                summary=f"{goal.status} · KPI: {goal.kpi}",
                kind="goal",
                updated_at=goal.due_date,
                source_id=goal.id,
            )
            for goal in self.store.goals[:2]
        )
        hits.extend(
            MemoryItem(
                id=f"memory-hit-{source.id}",
                title=source.title,
                summary=f"{source.source_type.title()} · {source.freshness}",
                kind="knowledge",
                updated_at=artifact.updated_at,
                source_id=source.id,
            )
            for source in self.store.knowledge_sources[:2]
        )
        if request.module == ModuleKey.CAPITAL:
            hits.extend(
                MemoryItem(
                    id=f"memory-hit-investor-{investor.id}",
                    title=investor.name,
                    summary=f"{investor.relationship_status} · {investor.next_step}",
                    kind="relationship",
                    updated_at=artifact.updated_at,
                    source_id=investor.id,
                )
                for investor in self.store.fundraise_pipeline.investors[:2]
            )
        return hits

    def _next_actions(self, request: ChatRequest) -> list[str]:
        if request.module == ModuleKey.CAPITAL:
            return [
                "Publish the latest artifact to the investor room",
                "Queue diligence follow-up for top investors",
                "Ask FundraiseAgent to tighten the round narrative",
            ]
        if request.module == ModuleKey.APPS:
            return [
                "Launch the suggested app with the current prompt",
                "Review the generated artifact and save edits",
                "Route the output back into the command thread",
            ]
        return [
            "Keep working in the same command thread",
            "Promote the output into a durable artifact",
            "Delegate follow-through to the right agent or app",
        ]

    def _build_nodes(self, request: ChatRequest, artifact, task, launched_app_id: str | None) -> list[ThreadNode]:
        nodes = [
            ThreadNode(
                id=f"node-artifact-{artifact.id}",
                kind="artifact",
                title=artifact.title,
                summary=artifact.summary,
                status="ready",
                expanded_by_default=True,
                body=artifact.content[:1600],
                artifact_id=artifact.id,
                cta_label="Open artifact",
            ),
            ThreadNode(
                id=f"node-run-{task.id}",
                kind="run",
                title=task.title,
                summary=task.progress_label,
                status=task.status.value,
                bullet_points=[
                    f"Agent: {task.owner_agent_id}",
                    f"Trace: {task.trace_summary}",
                    f"Outputs: {', '.join(task.outputs)}",
                ],
                task_run_id=task.id,
            ),
        ]
        if task.requires_approval:
            nodes.append(
                ThreadNode(
                    id=f"node-approval-{task.id}",
                    kind="approval",
                    title="Founder approval required",
                    summary="This step needs your sign-off before external or irreversible work continues.",
                    status="waiting",
                    bullet_points=[
                        "Approve to continue",
                        "Request revision to tighten the output",
                        "Reject to stop the action",
                    ],
                    task_run_id=task.id,
                    cta_label="Review approval",
                )
            )
        if launched_app_id:
            app = self.store.get_app(launched_app_id)
            nodes.append(
                ThreadNode(
                    id=f"node-app-{app.id}",
                    kind="app",
                    title=app.title,
                    summary=app.summary,
                    status=app.status,
                    bullet_points=[
                        f"Uses {len(app.skill_ids)} skills",
                        f"Outputs: {', '.join(app.artifact_outputs)}",
                    ],
                    app_id=app.id,
                    cta_label="Open app workspace",
                )
            )
        return nodes

    def _system_prompt(self, request: ChatRequest, agent_name: str, role: str) -> str:
        goals = "\n".join(f"- {goal.title}: {goal.kpi}" for goal in self.store.goals[:3])
        return (
            f"You are {agent_name} inside VXV Workspace.\n"
            f"Role: {role}\n"
            f"Founder: {self.store.workspace.founder_name}\n"
            f"Company: {self.store.workspace.company_name}\n"
            f"Active module: {request.module.value}\n"
            "Respond in concise markdown with these sections:\n"
            "## What I did\n## Why it matters\n## Suggested next step\n"
            "Ground the answer in the founder operating system and avoid generic AI assistant framing.\n"
            f"Current priorities:\n{goals}"
        )

    def _generate_reply_content(self, request: ChatRequest, agent_name: str, role: str, artifact_title: str) -> str:
        if self.runtime.is_ready():
            try:
                return self.runtime.generate(
                    agent_name=agent_name,
                    sys_prompt=self._system_prompt(request, agent_name, role),
                    user_prompt=request.message,
                )
            except Exception:
                pass

        return (
            f"## {agent_name}\n\n"
            f"I translated your request into a workspace action that fits the `{request.module.value}` module.\n\n"
            "### What I did\n"
            "- Routed the task to the right agent role\n"
            f"- Created or refreshed the artifact `{artifact_title}`\n"
            "- Opened a tracked run so the work stays visible in the operating layer\n\n"
            "### Suggested next step\n"
            "Review the artifact in the inspector, then either approve the run or ask me to tighten the output further.\n"
        )

    def _generate_structured_document(
        self,
        *,
        agent_name: str,
        role: str,
        module: ModuleKey,
        title: str,
        prompt: str,
        context: str,
        fallback: str,
    ) -> str:
        if self.runtime.is_ready():
            try:
                system_prompt = (
                    f"You are {agent_name} inside VXV Workspace.\n"
                    f"Role: {role}\n"
                    f"Module: {module.value}\n"
                    "Generate a founder-grade markdown document with clear headings, concise bullets, "
                    "and practical next steps. Avoid generic AI caveats.\n"
                    f"Document title: {title}\n"
                    f"Context:\n{context}"
                )
                return self.runtime.generate(
                    agent_name=agent_name,
                    sys_prompt=system_prompt,
                    user_prompt=prompt,
                )
            except Exception:
                pass

        return fallback

    def respond(self, request: ChatRequest) -> ChatResponse:
        active_agent = self._select_agent(request)
        self.store.append_message(
            role="user",
            author="Founder",
            module=request.module,
            content=request.message,
        )

        task = self.store.add_task_run(
            title=f"{active_agent.name.replace('Agent', '')} response",
            module=request.module,
            owner_agent_id=active_agent.id,
            progress_label="Drafting next best action",
            trace_summary=f"{active_agent.name} converted the founder request into a reusable workspace output.",
            outputs=["Agent response", "Artifact update"],
            requires_approval=request.module in {ModuleKey.EXECUTION, ModuleKey.CAPITAL},
            status=TaskStatus.WAITING if request.module in {ModuleKey.EXECUTION, ModuleKey.CAPITAL} else TaskStatus.RUNNING,
        )

        artifact_title, artifact_summary, artifact_content, artifact_kind = self._artifact_template(request)
        artifact = self.store.upsert_artifact(
            title=artifact_title,
            module=request.module,
            summary=artifact_summary,
            content=artifact_content,
            kind=artifact_kind,
            linked_run_id=task.id,
        )

        reply_content = self._generate_reply_content(
            request=request,
            agent_name=active_agent.name,
            role=active_agent.role,
            artifact_title=artifact.title,
        )

        reply = self.store.append_message(
            role="assistant",
            author=active_agent.name,
            module=request.module,
            content=reply_content,
        )

        launched_app_id = self._pick_app_id(request)
        return ChatResponse(
            reply=reply,
            active_agent=active_agent,
            task_run=task,
            artifact=artifact,
            suggestions=[
                "Turn this into a tracked founder workflow",
                "Use an app or skill if a deeper workflow is needed",
                "Keep building on this in the same thread",
            ],
            routed_module=active_agent.module,
            context_items=self._context_items(request, artifact.title),
            next_actions=self._next_actions(request),
            nodes=self._build_nodes(request, artifact, task, launched_app_id),
            memory_hits=self._memory_hits(request, artifact),
            launched_app_id=launched_app_id,
            updated_metrics=self.store.metrics(),
        )

    def decide_approval(self, task_id: str, decision: ApprovalDecision) -> ActionResponse:
        task = self.store.get_task_run(task_id)

        if decision == ApprovalDecision.APPROVE:
            task.status = TaskStatus.COMPLETED
            task.progress_label = "Approved by founder"
            task.trace_summary = f"{task.trace_summary} The founder approved the action and the run was cleared to proceed."
            message = "Approval recorded. The run has been cleared to continue."
        elif decision == ApprovalDecision.REQUEST_REVISION:
            task.status = TaskStatus.RUNNING
            task.progress_label = "Revision requested"
            task.trace_summary = f"{task.trace_summary} Founder requested changes before the action is finalized."
            message = "Revision requested. The responsible agent should tighten the output."
        else:
            task.status = TaskStatus.REJECTED
            task.progress_label = "Rejected by founder"
            task.trace_summary = f"{task.trace_summary} Founder rejected the action."
            message = "The action was rejected and will not proceed."

        task.requires_approval = False
        self.store.persist()
        return ActionResponse(task_run=task, message=message)

    def launch_app(self, app_id: str, request: AppLaunchRequest) -> ActionResponse:
        app = self.store.get_app(app_id)
        active_agent = self._select_agent(
            ChatRequest(module=ModuleKey.APPS, message=f"{app.title}: {request.prompt}")
        )

        task = self.store.add_task_run(
            title=f"{app.title} run",
            module=ModuleKey.APPS,
            owner_agent_id=active_agent.id,
            progress_label="Generating outputs",
            trace_summary=f"{app.title} is running inside the workspace and composing {len(app.skill_ids)} skills into publishable outputs.",
            outputs=app.artifact_outputs,
            requires_approval=app.module == ModuleKey.CAPITAL,
            status=TaskStatus.WAITING if app.module == ModuleKey.CAPITAL else TaskStatus.RUNNING,
        )

        artifact_content = self._generate_structured_document(
            agent_name=active_agent.name,
            role=active_agent.role,
            module=ModuleKey.APPS,
            title=f"{app.title} Output",
            prompt=request.prompt,
            context=(
                f"App title: {app.title}\n"
                f"App summary: {app.summary}\n"
                f"Artifact outputs: {', '.join(app.artifact_outputs)}\n"
                f"Skill ids: {', '.join(app.skill_ids)}"
            ),
            fallback=(
                f"# {app.title} Output\n\n"
                f"## Founder prompt\n{request.prompt}\n\n"
                "## App interpretation\n"
                f"- Routed through the {app.title} workflow surface\n"
                f"- Used {len(app.skill_ids)} skills behind the scenes\n"
                f"- Linked the result back into the shared artifact layer\n\n"
                "## Next actions\n"
                "1. Review the generated artifact\n"
                "2. Decide whether to save, share, or publish it\n"
                "3. Use the run trace for accountability and follow-through\n"
            ),
        )

        artifact = self.store.upsert_artifact(
            title=f"{app.title} Output",
            module=ModuleKey.APPS,
            summary=f"Output generated by the {app.title} app.",
            content=artifact_content,
            kind=ArtifactKind.REPORT,
            linked_run_id=task.id,
        )

        app.last_run_at = task.created_at
        self.store.persist()

        return ActionResponse(
            task_run=task,
            artifact=artifact,
            message=f"{app.title} launched successfully.",
        )

    def publish_investor_room(self, request: PublishInvestorRoomRequest) -> InvestorRoomActionResponse:
        room = self.store.publish_investor_room(request.artifact_id)
        return InvestorRoomActionResponse(
            investor_room=room,
            message="Investor room updated and ready to share.",
        )

    def launch_workflow(self, workflow_id: str, request: WorkflowLaunchRequest) -> ActionResponse:
        workflow = self.store.get_workflow(workflow_id)
        active_agent = self._select_agent(
            ChatRequest(module=workflow.module, message=f"{workflow.title}: {request.note}")
        )

        task = self.store.add_task_run(
            title=workflow.title,
            module=workflow.module,
            owner_agent_id=active_agent.id,
            progress_label="Workflow is drafting outputs",
            trace_summary=(
                f"{workflow.title} is running through {active_agent.name} to turn founder intent "
                "into an accountable workflow output."
            ),
            outputs=workflow.outputs,
            requires_approval=workflow.module in {ModuleKey.EXECUTION, ModuleKey.CAPITAL},
            status=TaskStatus.WAITING if workflow.module in {ModuleKey.EXECUTION, ModuleKey.CAPITAL} else TaskStatus.RUNNING,
        )

        artifact_kind = ArtifactKind.MEMO if workflow.module == ModuleKey.CAPITAL else ArtifactKind.PLAN
        artifact_content = self._generate_structured_document(
            agent_name=active_agent.name,
            role=active_agent.role,
            module=workflow.module,
            title=f"{workflow.title} Output",
            prompt=request.note,
            context=(
                f"Workflow title: {workflow.title}\n"
                f"Workflow description: {workflow.description}\n"
                f"Workflow outputs: {', '.join(workflow.outputs)}"
            ),
            fallback=(
                f"# {workflow.title}\n\n"
                f"## Founder note\n{request.note}\n\n"
                "## Workflow scope\n"
                f"- Module: {workflow.module.value}\n"
                f"- Outputs: {', '.join(workflow.outputs)}\n"
                f"- Responsible agent: {active_agent.name}\n\n"
                "## Suggested next moves\n"
                "1. Review the workflow output\n"
                "2. Approve external-facing actions if required\n"
                "3. Route the artifact into the right module or investor room\n"
            ),
        )

        artifact = self.store.upsert_artifact(
            title=f"{workflow.title} Output",
            module=workflow.module,
            summary=f"Workflow output generated for {workflow.title}.",
            content=artifact_content,
            kind=artifact_kind,
            linked_run_id=task.id,
        )

        return ActionResponse(
            task_run=task,
            artifact=artifact,
            message=f"{workflow.title} launched successfully.",
        )
