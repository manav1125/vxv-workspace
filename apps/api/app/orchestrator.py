from __future__ import annotations

from typing import Iterable

from .models import (
    ActionResponse,
    AppLaunchRequest,
    ApprovalDecision,
    Artifact,
    ArtifactKind,
    ChatRequest,
    ChatResponse,
    InvestorRoomActionResponse,
    MemoryItem,
    ModuleKey,
    PublishInvestorRoomRequest,
    TaskRun,
    TaskStatus,
    ThreadNode,
    WorkflowLaunchRequest,
)
from .runtime import AgentScopeRuntimeAdapter
from .skill_engine import SkillEngine, SkillExecution
from .store import DemoStore


class FounderOrchestrator:
    def __init__(self, store: DemoStore) -> None:
        self.store = store
        self.runtime = AgentScopeRuntimeAdapter()
        self.skill_engine = SkillEngine(self.runtime)

    def _select_agent(self, module: ModuleKey, text: str):
        lowered = text.lower()
        if any(keyword in lowered for keyword in ["investor", "fundraise", "diligence", "memo", "deck", "pitch"]):
            return self.store.get_agent("agent-fundraise")
        if any(keyword in lowered for keyword in ["gtm", "growth", "campaign", "customer", "competitor", "research"]):
            return self.store.get_agent("agent-research")
        if any(keyword in lowered for keyword in ["cadence", "ops", "workflow", "review", "blocker"]):
            return self.store.get_agent("agent-ops")
        if any(keyword in lowered for keyword in ["hiring", "scorecard", "interview", "team"]):
            return self.store.get_agent("agent-chief")
        if any(keyword in lowered for keyword in ["artifact", "board", "summary", "report", "update"]):
            return self.store.get_agent("agent-analyst")

        module_map = {
            ModuleKey.INBOX: "agent-chief",
            ModuleKey.STRATEGY: "agent-research",
            ModuleKey.TEAM: "agent-chief",
            ModuleKey.EXECUTION: "agent-ops",
            ModuleKey.ARTIFACTS: "agent-analyst",
            ModuleKey.CAPITAL: "agent-fundraise",
            ModuleKey.APPS: "agent-chief",
        }
        return self.store.get_agent(module_map[module])

    def _pick_app_id(self, text: str, module: ModuleKey) -> str | None:
        lowered = text.lower()
        if any(keyword in lowered for keyword in ["investor update", "diligence", "investor room"]):
            return "app-investor-update"
        if any(keyword in lowered for keyword in ["deck", "pitch", "investor memo", "deck review"]):
            return "app-pitch-reviewer"
        if any(keyword in lowered for keyword in ["competitor", "market map"]):
            return "app-competitor-analyst"
        if any(keyword in lowered for keyword in ["customer research", "interview", "persona"]):
            return "app-research-synthesizer"
        if any(keyword in lowered for keyword in ["weekly review", "founder review", "cadence", "blockers"]):
            return "app-founder-review"
        if any(keyword in lowered for keyword in ["hiring", "scorecard"]):
            return "app-hiring-scorecard"
        if module == ModuleKey.APPS:
            featured = next((app for app in self.store.apps if app.featured), None)
            return featured.id if featured else None
        return None

    def _infer_skill_ids(self, text: str, module: ModuleKey, app_id: str | None) -> list[str]:
        lowered = text.lower()
        skills: list[str] = list(self.store.get_app(app_id).skill_ids) if app_id else []
        if any(keyword in lowered for keyword in ["deck", "pitch", "investor memo"]):
            skills.append("skill-deck-review")
        if any(keyword in lowered for keyword in ["market", "competitor", "positioning", "gtm"]):
            skills.append("skill-market-synthesis")
        if any(keyword in lowered for keyword in ["customer", "persona", "interview", "research"]):
            skills.append("skill-persona-clustering")
        if any(keyword in lowered for keyword in ["founder review", "weekly review", "blocker", "cadence", "decision"]):
            skills.append("skill-founder-review")
        if any(keyword in lowered for keyword in ["diligence", "investor room", "fundraise", "investor update"]):
            skills.append("skill-diligence-pack")
        if any(keyword in lowered for keyword in ["hire", "hiring", "scorecard", "interview kit"]):
            skills.append("skill-hiring-scorecard")

        if not skills:
            default_by_module = {
                ModuleKey.INBOX: ["skill-founder-review"],
                ModuleKey.STRATEGY: ["skill-market-synthesis"],
                ModuleKey.TEAM: ["skill-hiring-scorecard"],
                ModuleKey.EXECUTION: ["skill-founder-review"],
                ModuleKey.ARTIFACTS: ["skill-market-synthesis"],
                ModuleKey.CAPITAL: ["skill-diligence-pack"],
                ModuleKey.APPS: ["skill-market-synthesis"],
            }
            skills = default_by_module[module]

        deduped: list[str] = []
        for skill in skills:
            if skill not in deduped:
                deduped.append(skill)
        return deduped

    def _selected_artifact_content(self, artifact_id: str | None) -> str | None:
        if not artifact_id:
            return None
        try:
            return self.store.get_artifact(artifact_id).content
        except KeyError:
            return None

    def _execute_skills(
        self,
        *,
        skill_ids: Iterable[str],
        founder_prompt: str,
        memory_hits: list[MemoryItem],
        selected_artifact_id: str | None,
    ) -> list[SkillExecution]:
        selected_artifact = self._selected_artifact_content(selected_artifact_id)
        executions: list[SkillExecution] = []
        for skill_id in skill_ids:
            executions.append(
                self.skill_engine.run(
                    skill_id=skill_id,
                    founder_prompt=founder_prompt,
                    memory_hits=memory_hits,
                    workspace_name=self.store.workspace.company_name,
                    founder_name=self.store.workspace.founder_name,
                    selected_artifact_content=selected_artifact,
                )
            )
        return executions

    def _compose_artifact(
        self,
        *,
        task: TaskRun,
        module: ModuleKey,
        app_id: str | None,
        executions: list[SkillExecution],
    ) -> Artifact:
        primary = executions[0]
        if app_id:
            app = self.store.get_app(app_id)
            title = f"{app.title} Output"
            summary = f"{app.title} ran {len(executions)} skill(s) and saved a reusable output."
            kind = ArtifactKind.REPORT if module == ModuleKey.APPS else primary.artifact_kind
        elif len(executions) == 1:
            title = primary.artifact_title
            summary = primary.artifact_summary
            kind = primary.artifact_kind
        else:
            title = "Founder Workspace Output"
            summary = "Combined output assembled from multiple workspace skills."
            kind = ArtifactKind.REPORT

        content = "\n\n".join(
            [
                f"# {title}",
                *[
                    f"## {execution.title}\n\n{execution.body}"
                    for execution in executions
                ],
            ]
        )
        return self.store.upsert_artifact(
            title=title,
            module=module,
            summary=summary,
            content=content,
            kind=kind,
            linked_run_id=task.id,
        )

    def _reply_content(
        self,
        *,
        prompt: str,
        active_agent_name: str,
        active_agent_role: str,
        module: ModuleKey,
        artifact: Artifact,
        memory_hits: list[MemoryItem],
        executions: list[SkillExecution],
        app_id: str | None,
    ) -> str:
        executed_titles = ", ".join(execution.title for execution in executions)
        context_lines = "\n".join(f"- {item.title}: {item.summary}" for item in memory_hits[:5])
        if self.runtime.is_ready():
            try:
                system_prompt = (
                    f"You are {active_agent_name} inside VXV Workspace.\n"
                    f"Role: {active_agent_role}\n"
                    f"Module: {module.value}\n"
                    "Respond like a founder chief of staff. Be specific, grounded, and action-oriented.\n"
                    "Use markdown with sections: What happened, Context used, Recommended next step."
                )
                user_prompt = (
                    f"Founder request:\n{prompt}\n\n"
                    f"Executed skill work:\n- {executed_titles}\n\n"
                    f"Saved artifact: {artifact.title}\n"
                    f"Artifact summary: {artifact.summary}\n\n"
                    f"Memory used:\n{context_lines or '- None'}\n\n"
                    f"App launched: {app_id or 'None'}"
                )
                return self.runtime.generate(
                    agent_name=active_agent_name,
                    sys_prompt=system_prompt,
                    user_prompt=user_prompt,
                )
            except Exception:
                pass

        action_line = (
            f"I used the {self.store.get_app(app_id).title} workflow to execute {executed_titles}."
            if app_id
            else f"I executed {executed_titles} and saved the result as `{artifact.title}`."
        )
        return (
            f"## {active_agent_name}\n\n"
            "### What happened\n"
            f"- {action_line}\n"
            f"- The thread now has a reusable artifact: `{artifact.title}`\n\n"
            "### Context used\n"
            f"{context_lines or '- No prior memory was needed for this turn.'}\n\n"
            "### Recommended next step\n"
            "- Review the embedded nodes below.\n"
            "- Open the artifact or app workspace if you want to go deeper.\n"
            "- Keep working in this same thread so the memory stays continuous.\n"
        )

    def _next_actions(self, app_id: str | None, executions: list[SkillExecution]) -> list[str]:
        actions = [
            "Keep refining this in the same thread.",
            "Open the latest artifact and tighten it before sharing.",
            "Branch from this thread if you want to explore an alternate direction.",
        ]
        if app_id:
            actions.insert(0, "Open the app workspace for deeper review.")
        if any(execution.module == ModuleKey.CAPITAL for execution in executions):
            actions.insert(0, "Publish the strongest output to the investor room when it is ready.")
        return actions[:4]

    def _build_nodes(
        self,
        *,
        task: TaskRun,
        artifact: Artifact,
        executions: list[SkillExecution],
        app_id: str | None,
    ) -> list[ThreadNode]:
        nodes: list[ThreadNode] = [
            ThreadNode(
                id=f"node-run-{task.id}",
                kind="run",
                title=task.title,
                summary=task.progress_label,
                status=task.status.value,
                bullet_points=[
                    f"Owner: {task.owner_agent_id}",
                    f"Trace: {task.trace_summary}",
                    f"Outputs: {', '.join(task.outputs)}",
                ],
                task_run_id=task.id,
            )
        ]
        if app_id:
            app = self.store.get_app(app_id)
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
        for execution in executions:
            nodes.append(
                ThreadNode(
                    id=f"node-skill-{task.id}-{execution.skill_id}",
                    kind="skill",
                    title=execution.title,
                    summary=execution.summary,
                    status="completed",
                    body=execution.body[:1400],
                    bullet_points=execution.bullet_points,
                )
            )
        nodes.append(
            ThreadNode(
                id=f"node-artifact-{artifact.id}",
                kind="artifact",
                title=artifact.title,
                summary=artifact.summary,
                status="ready",
                expanded_by_default=True,
                body=artifact.content[:1800],
                bullet_points=[
                    f"Module: {artifact.module.value}",
                    f"Updated: {artifact.updated_at}",
                ],
                artifact_id=artifact.id,
                cta_label="Open artifact",
            )
        )
        if task.requires_approval:
            nodes.append(
                ThreadNode(
                    id=f"node-approval-{task.id}",
                    kind="approval",
                    title="Founder approval required",
                    summary="This output needs approval before external-facing work continues.",
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
        return nodes

    def _run_thread_flow(
        self,
        *,
        module: ModuleKey,
        prompt: str,
        selected_artifact_id: str | None = None,
        explicit_app_id: str | None = None,
    ) -> tuple:
        active_agent = self._select_agent(module, prompt)
        app_id = explicit_app_id or self._pick_app_id(prompt, module)
        memory_hits = self.store.search_memory(prompt, selected_artifact_id=selected_artifact_id)
        skill_ids = self._infer_skill_ids(prompt, module, app_id)
        executions = self._execute_skills(
            skill_ids=skill_ids,
            founder_prompt=prompt,
            memory_hits=memory_hits,
            selected_artifact_id=selected_artifact_id,
        )

        task_module = ModuleKey.APPS if explicit_app_id else module
        task = self.store.add_task_run(
            title=(self.store.get_app(app_id).title if app_id and explicit_app_id else f"{active_agent.name.replace('Agent', '')} thread run"),
            module=task_module,
            owner_agent_id=active_agent.id,
            progress_label=f"Executed {len(executions)} skill(s) from the thread",
            trace_summary=(
                f"{active_agent.name} retrieved {len(memory_hits)} memory item(s), "
                f"ran {', '.join(execution.title for execution in executions)}, and saved a durable output."
            ),
            outputs=[execution.artifact_title for execution in executions],
            requires_approval=module in {ModuleKey.CAPITAL, ModuleKey.EXECUTION},
            status=TaskStatus.WAITING if module in {ModuleKey.CAPITAL, ModuleKey.EXECUTION} else TaskStatus.COMPLETED,
        )

        artifact = self._compose_artifact(
            task=task,
            module=task_module,
            app_id=app_id,
            executions=executions,
        )
        reply_content = self._reply_content(
            prompt=prompt,
            active_agent_name=active_agent.name,
            active_agent_role=active_agent.role,
            module=module,
            artifact=artifact,
            memory_hits=memory_hits,
            executions=executions,
            app_id=app_id,
        )
        return active_agent, memory_hits, executions, task, artifact, reply_content, app_id

    def respond(self, request: ChatRequest) -> ChatResponse:
        self.store.append_message(
            role="user",
            author="Founder",
            module=request.module,
            content=request.message,
        )

        (
            active_agent,
            memory_hits,
            executions,
            task,
            artifact,
            reply_content,
            app_id,
        ) = self._run_thread_flow(
            module=request.module,
            prompt=request.message,
            selected_artifact_id=request.selected_artifact_id,
        )

        next_actions = self._next_actions(app_id, executions)
        nodes = self._build_nodes(task=task, artifact=artifact, executions=executions, app_id=app_id)
        reply = self.store.append_message(
            role="assistant",
            author=active_agent.name,
            module=request.module,
            content=reply_content,
            nodes=nodes,
            memory_hits=memory_hits,
            next_actions=next_actions,
        )

        return ChatResponse(
            reply=reply,
            active_agent=active_agent,
            task_run=task,
            artifact=artifact,
            suggestions=[
                "Keep the thread going instead of opening a new chat.",
                "Open the artifact if you need a deep edit.",
                "Use an app only when the thread needs a richer workspace.",
            ],
            routed_module=active_agent.module,
            context_items=[f"{item.title}: {item.summary}" for item in memory_hits],
            next_actions=next_actions,
            nodes=nodes,
            memory_hits=memory_hits,
            launched_app_id=app_id,
            updated_metrics=self.store.metrics(),
        )

    def decide_approval(self, task_id: str, decision: ApprovalDecision) -> ActionResponse:
        task = self.store.get_task_run(task_id)
        if decision == ApprovalDecision.APPROVE:
            task.status = TaskStatus.COMPLETED
            task.progress_label = "Approved by founder"
            task.trace_summary = f"{task.trace_summary} The founder approved the output."
            message = "Approval recorded. The run can proceed."
        elif decision == ApprovalDecision.REQUEST_REVISION:
            task.status = TaskStatus.RUNNING
            task.progress_label = "Revision requested"
            task.trace_summary = f"{task.trace_summary} Founder requested revision."
            message = "Revision requested."
        else:
            task.status = TaskStatus.REJECTED
            task.progress_label = "Rejected by founder"
            task.trace_summary = f"{task.trace_summary} Founder rejected the action."
            message = "The action was rejected."
        task.requires_approval = False
        self.store.persist()
        return ActionResponse(task_run=task, message=message)

    def launch_app(self, app_id: str, request: AppLaunchRequest) -> ActionResponse:
        (
            _active_agent,
            _memory_hits,
            _executions,
            task,
            artifact,
            _reply_content,
            resolved_app_id,
        ) = self._run_thread_flow(
            module=ModuleKey.APPS,
            prompt=request.prompt,
            explicit_app_id=app_id,
        )
        if resolved_app_id:
            self.store.get_app(resolved_app_id).last_run_at = task.created_at
            self.store.persist()
        return ActionResponse(
            task_run=task,
            artifact=artifact,
            message=f"{self.store.get_app(app_id).title} launched successfully.",
        )

    def publish_investor_room(self, request: PublishInvestorRoomRequest) -> InvestorRoomActionResponse:
        room = self.store.publish_investor_room(request.artifact_id)
        return InvestorRoomActionResponse(
            investor_room=room,
            message="Investor room updated and ready to share.",
        )

    def launch_workflow(self, workflow_id: str, request: WorkflowLaunchRequest) -> ActionResponse:
        workflow = self.store.get_workflow(workflow_id)
        (
            _active_agent,
            _memory_hits,
            _executions,
            task,
            artifact,
            _reply_content,
            _app_id,
        ) = self._run_thread_flow(
            module=workflow.module,
            prompt=f"{workflow.title}: {request.note}",
        )
        task.title = workflow.title
        task.outputs = workflow.outputs
        task.trace_summary = (
            f"{task.trace_summary} The workflow `{workflow.title}` packaged outputs for "
            f"{', '.join(workflow.outputs)}."
        )
        self.store.persist()
        return ActionResponse(
            task_run=task,
            artifact=artifact,
            message=f"{workflow.title} launched successfully.",
        )
