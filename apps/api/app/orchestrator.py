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
    ThreadExecutionSession,
    ThreadNode,
    ToolCallRecord,
    WorkflowLaunchRequest,
)
from .runtime import AgentScopeRuntimeAdapter
from .skill_engine import SkillEngine, SkillExecution
from .store import DemoStore
from .tool_adapters import ThreadToolAdapters, ThreadToolContext


class FounderOrchestrator:
    def __init__(self, store: DemoStore) -> None:
        self.store = store
        self.runtime = AgentScopeRuntimeAdapter()
        self.skill_engine = SkillEngine(self.runtime)

    def _select_agent(self, module: ModuleKey, text: str):
        lowered = text.lower()
        if any(keyword in lowered for keyword in ["financial model", "forecast", "runway", "burn", "revenue model", "unit economics"]):
            return self.store.get_agent("agent-analyst")
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
        if any(keyword in lowered for keyword in ["financial model", "forecast", "runway", "burn", "unit economics", "revenue model"]):
            return "app-financial-model"
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
        if any(keyword in lowered for keyword in ["financial model", "forecast", "runway", "burn", "unit economics", "revenue model"]):
            skills.append("skill-financial-model")
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
                ModuleKey.CAPITAL: ["skill-financial-model"],
                ModuleKey.APPS: ["skill-market-synthesis"],
            }
            skills = default_by_module[module]

        deduped: list[str] = []
        for skill in skills:
            if skill not in deduped:
                deduped.append(skill)
        enabled = self.store.enabled_skill_ids()
        return [skill for skill in deduped if skill in enabled]

    def _compose_skill_artifact(
        self,
        *,
        task: TaskRun,
        module: ModuleKey,
        executions: list[SkillExecution],
    ) -> Artifact:
        primary = executions[0]
        if len(executions) == 1:
            title = primary.artifact_title
            summary = primary.artifact_summary
            kind = primary.artifact_kind
        else:
            title = "Founder Workspace Output"
            summary = "Combined output assembled from multiple founder workspace actions."
            kind = ArtifactKind.REPORT

        content = "\n\n".join(
            [f"# {title}"] + [f"## {execution.title}\n\n{execution.body}" for execution in executions]
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
        artifact: Artifact | None,
        memory_hits: list[MemoryItem],
        executions: list[SkillExecution],
        app_id: str | None,
        execution_summary: str,
    ) -> str:
        app_title = self.store.get_app(app_id).title if app_id else None
        primary_execution = executions[0] if executions else None
        if artifact:
            if app_title:
                lead = f"I ran `{app_title}` and produced `{artifact.title}`."
            elif primary_execution:
                lead = f"I completed `{primary_execution.title}` and produced `{artifact.title}`."
            else:
                lead = f"I completed the requested work and saved `{artifact.title}`."
        else:
            lead = "I worked from the current thread and prepared the next step."

        context_lines = [f"- {item.title}" for item in memory_hits[:3]]
        result_lines: list[str] = []
        if artifact:
            result_lines.append(f"- Output ready: `{artifact.title}`")
            result_lines.append(f"- {artifact.summary}")
        for execution in executions[:2]:
            result_lines.extend(f"- {bullet}" for bullet in execution.bullet_points[:2])
        if not result_lines:
            result_lines.append("- No reusable output is ready yet.")

        next_steps = [
            "- Open the work panel to inspect or edit the result.",
            "- Reply in this thread with the changes you want and I will update the same output.",
        ]
        if primary_execution and primary_execution.skill_id == "skill-financial-model":
            next_steps = [
                "- Confirm your current cash balance, monthly payroll, and target revenue plan.",
                "- I can turn this draft into a tighter 12-month operating model in the same thread.",
            ]

        return (
            f"{lead}\n\n"
            "What I used\n"
            f"- Lead agent: {active_agent_name}\n"
            f"{chr(10).join(context_lines) if context_lines else '- Current thread context only'}\n\n"
            "What is ready\n"
            f"{chr(10).join(result_lines)}\n\n"
            "Next\n"
            f"{chr(10).join(next_steps)}"
        )

    def _next_actions(self, app_id: str | None, executions: list[SkillExecution], tool_calls: list[ToolCallRecord]) -> list[str]:
        actions = [
            "Keep refining this in the same thread.",
            "Open the latest artifact and tighten it before sharing.",
            "Ask the workspace to branch this into an alternate plan if needed.",
        ]
        if app_id:
            actions.insert(0, "Open the app workspace for deeper execution.")
        if any(call.name == "publish_to_investor_room" for call in tool_calls):
            actions.insert(0, "Share the investor room once the founder approves the latest output.")
        elif any(execution.module == ModuleKey.CAPITAL for execution in executions):
            actions.insert(0, "Publish the strongest capital output to the investor room when ready.")
        return actions[:4]

    def _build_nodes(
        self,
        *,
        task: TaskRun,
        artifact: Artifact | None,
        executions: list[SkillExecution],
        app_id: str | None,
        execution_session: ThreadExecutionSession,
        tool_calls: list[ToolCallRecord],
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
                    f"Tools used: {', '.join(call.name for call in tool_calls[:4]) or 'No tools recorded'}",
                ],
                task_run_id=task.id,
                thread_execution_id=execution_session.id,
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
                    thread_execution_id=execution_session.id,
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
                    thread_execution_id=execution_session.id,
                )
            )

        if artifact:
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
                    thread_execution_id=execution_session.id,
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
                    thread_execution_id=execution_session.id,
                    cta_label="Review approval",
                )
            )
        return nodes

    def _execute_fallback_tools(
        self,
        *,
        adapters: ThreadToolAdapters,
        module: ModuleKey,
        prompt: str,
        selected_artifact_id: str | None,
        explicit_app_id: str | None,
    ) -> str:
        enabled_tools = adapters.context.enabled_tool_names
        if "retrieve_workspace_memory" in enabled_tools:
            adapters.retrieve_workspace_memory(prompt)
        if selected_artifact_id:
            if "inspect_selected_artifact" in enabled_tools:
                adapters.inspect_selected_artifact(selected_artifact_id)

        app_id = explicit_app_id or self._pick_app_id(prompt, module)
        if app_id and "launch_workspace_app" in enabled_tools:
            adapters.launch_workspace_app(app_id, prompt)
        elif "run_workspace_skill" in enabled_tools:
            for skill_id in self._infer_skill_ids(prompt, module, app_id)[:2]:
                adapters.run_workspace_skill(skill_id, prompt)

        if (
            "publish_to_investor_room" in enabled_tools
            and module == ModuleKey.CAPITAL
            and any(keyword in prompt.lower() for keyword in ["publish", "send room", "investor room"])
        ):
            adapters.publish_to_investor_room()

        return ""

    def _run_thread_runtime(
        self,
        *,
        thread_id: str,
        module: ModuleKey,
        prompt: str,
        active_agent,
        selected_artifact_id: str | None,
        task: TaskRun,
        execution_session: ThreadExecutionSession,
        explicit_app_id: str | None = None,
    ) -> tuple[str, list[MemoryItem], list[SkillExecution], list[ToolCallRecord], str | None, Artifact | None]:
        context = ThreadToolContext(
            execution_id=execution_session.id,
            thread_id=thread_id,
            founder_prompt=prompt,
            module=module,
            active_agent_id=active_agent.id,
            task_run_id=task.id,
            selected_artifact_id=selected_artifact_id,
            enabled_skill_ids=self.store.enabled_skill_ids(),
            enabled_tool_names=self.store.enabled_tool_names(),
        )
        adapters = ThreadToolAdapters(self.store, self.skill_engine, context)

        if self.runtime.is_ready():
            system_prompt = (
                f"You are {active_agent.name}, the {active_agent.role}\n"
                "You are operating inside VXV Workspace for a founder.\n"
                "Always keep the work in one thread.\n"
                "Before answering, retrieve workspace memory.\n"
                "If there is an attached artifact or the founder references a document or deck, inspect it.\n"
                "When meaningful work is needed, use either run_workspace_skill or launch_workspace_app.\n"
                "Use publish_to_investor_room only for investor-facing capital work.\n"
                "After tool use, call generate_response with a concise but useful founder-facing answer."
            )
            runtime_prompt = prompt
            if explicit_app_id:
                app = self.store.get_app(explicit_app_id)
                runtime_prompt = f"Launch the app `{app.title}` for this founder request: {prompt}"
            try:
                reply_content, _metadata = self.runtime.run_react(
                    agent_name=active_agent.name,
                    sys_prompt=system_prompt,
                    toolkit=adapters.build_toolkit(),
                    user_prompt=runtime_prompt,
                )
            except Exception:
                reply_content = self._execute_fallback_tools(
                    adapters=adapters,
                    module=module,
                    prompt=prompt,
                    selected_artifact_id=selected_artifact_id,
                    explicit_app_id=explicit_app_id,
                )
        else:
            reply_content = self._execute_fallback_tools(
                adapters=adapters,
                module=module,
                prompt=prompt,
                selected_artifact_id=selected_artifact_id,
                explicit_app_id=explicit_app_id,
            )

        if not adapters.tool_calls() or (
            not adapters.skill_executions() and adapters.launched_app_id() is None and adapters.output_artifact() is None
        ):
            reply_content = self._execute_fallback_tools(
                adapters=adapters,
                module=module,
                prompt=prompt,
                selected_artifact_id=selected_artifact_id,
                explicit_app_id=explicit_app_id,
            )

        artifact = adapters.output_artifact()
        executions = adapters.skill_executions()
        if artifact is None and executions:
            artifact = self._compose_skill_artifact(task=task, module=module, executions=executions)

        return (
            reply_content,
            adapters.memory_hits(),
            executions,
            adapters.tool_calls(),
            adapters.launched_app_id() or explicit_app_id,
            artifact,
        )

    def _complete_task(
        self,
        *,
        task: TaskRun,
        module: ModuleKey,
        active_agent_id: str,
        memory_hits: list[MemoryItem],
        executions: list[SkillExecution],
        tool_calls: list[ToolCallRecord],
        artifact: Artifact | None,
        app_id: str | None,
    ) -> TaskRun:
        task.status = TaskStatus.WAITING if module in {ModuleKey.CAPITAL, ModuleKey.EXECUTION} else TaskStatus.COMPLETED
        task.requires_approval = module in {ModuleKey.CAPITAL, ModuleKey.EXECUTION}
        task.progress_label = (
            f"App `{self.store.get_app(app_id).title}` executed and saved founder output."
            if app_id
            else f"Executed {len(tool_calls)} tool action(s) from the founder thread."
        )
        task.trace_summary = (
            f"{active_agent_id} retrieved {len(memory_hits)} memory item(s), used "
            f"{', '.join(call.name for call in tool_calls) or 'no explicit tools'}, and "
            f"{'saved ' + artifact.title if artifact else 'left the result in-thread'}."
        )
        task.outputs = [artifact.title] if artifact else [execution.artifact_title for execution in executions]
        self.store.persist()
        return task

    def _run_turn(
        self,
        *,
        thread_id: str,
        module: ModuleKey,
        prompt: str,
        selected_artifact_id: str | None = None,
        explicit_app_id: str | None = None,
        append_user_message: bool = True,
    ) -> tuple:
        if append_user_message:
            self.store.append_message(
                role="user",
                author="Founder",
                module=module,
                content=prompt,
                thread_id=thread_id,
            )

        active_agent = self._select_agent(module, prompt)
        task = self.store.add_task_run(
            title=self.store.get_app(explicit_app_id).title if explicit_app_id else f"{active_agent.name.replace('Agent', '')} thread run",
            module=ModuleKey.APPS if explicit_app_id else module,
            owner_agent_id=active_agent.id,
            progress_label="Reasoning through the founder request",
            trace_summary="Execution session opened from the founder thread.",
            outputs=[],
            requires_approval=False,
            status=TaskStatus.RUNNING,
        )
        execution_session = self.store.create_thread_execution(
            thread_id=thread_id,
            module=ModuleKey.APPS if explicit_app_id else module,
            prompt=prompt,
            agent_id=active_agent.id,
            selected_artifact_id=selected_artifact_id,
            task_run_id=task.id,
        )

        reply_content, memory_hits, executions, tool_calls, app_id, artifact = self._run_thread_runtime(
            thread_id=thread_id,
            module=ModuleKey.APPS if explicit_app_id else module,
            prompt=prompt,
            active_agent=active_agent,
            selected_artifact_id=selected_artifact_id,
            task=task,
            execution_session=execution_session,
            explicit_app_id=explicit_app_id,
        )

        task = self._complete_task(
            task=task,
            module=ModuleKey.APPS if explicit_app_id else module,
            active_agent_id=active_agent.name,
            memory_hits=memory_hits,
            executions=executions,
            tool_calls=tool_calls,
            artifact=artifact,
            app_id=app_id,
        )
        execution_summary = (
            f"Used {len(tool_calls)} tool call(s), {len(executions)} skill execution(s), and "
            f"{'saved ' + artifact.title if artifact else 'kept the result in thread'}."
        )
        final_reply = self._reply_content(
            prompt=prompt,
            active_agent_name=active_agent.name,
            active_agent_role=active_agent.role,
            module=ModuleKey.APPS if explicit_app_id else module,
            artifact=artifact,
            memory_hits=memory_hits,
            executions=executions,
            app_id=app_id,
            execution_summary=execution_summary,
        )
        next_actions = self._next_actions(app_id, executions, tool_calls)
        execution_session = self.store.update_thread_execution(
            execution_session.id,
            status=task.status.value,
            summary=execution_summary,
            app_id=app_id,
            response_excerpt=final_reply[:500],
            output_artifact_ids=[artifact.id] if artifact else [],
            tool_calls=tool_calls,
        )
        nodes = self._build_nodes(
            task=task,
            artifact=artifact,
            executions=executions,
            app_id=app_id,
            execution_session=execution_session,
            tool_calls=tool_calls,
        )
        reply = self.store.append_message(
            role="assistant",
            author=active_agent.name,
            module=ModuleKey.APPS if explicit_app_id else module,
            content=final_reply,
            thread_id=thread_id,
            nodes=nodes,
            memory_hits=memory_hits,
            next_actions=next_actions,
        )
        execution_session = self.store.update_thread_execution(
            execution_session.id,
            message_id=reply.id,
            status=task.status.value,
            summary=execution_summary,
            app_id=app_id,
            response_excerpt=final_reply[:500],
            output_artifact_ids=[artifact.id] if artifact else [],
            tool_calls=tool_calls,
        )

        return active_agent, memory_hits, executions, task, artifact, reply, app_id, next_actions, nodes, execution_session

    def respond(self, request: ChatRequest) -> ChatResponse:
        (
            active_agent,
            memory_hits,
            executions,
            task,
            artifact,
            reply,
            app_id,
            next_actions,
            nodes,
            execution_session,
        ) = self._run_turn(
            thread_id=request.thread_id or self.store.active_thread_id,
            module=request.module,
            prompt=request.message,
            selected_artifact_id=request.selected_artifact_id,
            append_user_message=True,
        )

        return ChatResponse(
            reply=reply,
            active_agent=active_agent,
            task_run=task,
            artifact=artifact or self.store.artifacts[0],
            suggestions=[
                "Keep the thread going instead of opening a new chat.",
                "Open the output node if you need a deeper working panel.",
                "Ask the workspace to launch an app only when the thread needs heavier execution.",
            ],
            routed_module=active_agent.module,
            context_items=[f"{item.title}: {item.summary}" for item in memory_hits],
            next_actions=next_actions,
            nodes=nodes,
            memory_hits=memory_hits,
            thread_execution=execution_session,
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
            _reply,
            _app_id,
            _next_actions,
            _nodes,
            _execution_session,
        ) = self._run_turn(
            thread_id=self.store.active_thread_id,
            module=ModuleKey.APPS,
            prompt=request.prompt,
            explicit_app_id=app_id,
            append_user_message=False,
        )
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
            _reply,
            _app_id,
            _next_actions,
            _nodes,
            _execution_session,
        ) = self._run_turn(
            thread_id=self.store.active_thread_id,
            module=workflow.module,
            prompt=f"{workflow.title}: {request.note}",
            append_user_message=False,
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
