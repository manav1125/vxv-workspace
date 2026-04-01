from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from agentscope.service import ServiceExecStatus, ServiceResponse, ServiceToolkit

from .models import Artifact, MemoryItem, ModuleKey, TaskRun, ToolCallRecord, WorkspaceApp
from .skill_engine import SkillEngine, SkillExecution
from .store import DemoStore


@dataclass
class ThreadToolContext:
    execution_id: str
    founder_prompt: str
    module: ModuleKey
    active_agent_id: str
    task_run_id: str
    selected_artifact_id: Optional[str] = None
    memory_hits: list[MemoryItem] = field(default_factory=list)
    tool_calls: list[ToolCallRecord] = field(default_factory=list)
    skill_executions: list[SkillExecution] = field(default_factory=list)
    launched_app: Optional[WorkspaceApp] = None
    output_artifact: Optional[Artifact] = None
    published_investor_room: bool = False


class ThreadToolAdapters:
    def __init__(self, store: DemoStore, skill_engine: SkillEngine, context: ThreadToolContext) -> None:
        self.store = store
        self.skill_engine = skill_engine
        self.context = context

    def build_toolkit(self) -> ServiceToolkit:
        toolkit = ServiceToolkit()
        toolkit.add(self.retrieve_workspace_memory)
        toolkit.add(self.inspect_selected_artifact)
        toolkit.add(self.run_workspace_skill)
        toolkit.add(self.launch_workspace_app)
        toolkit.add(self.publish_to_investor_room)
        return toolkit

    def retrieve_workspace_memory(self, query: str) -> ServiceResponse:
        """Retrieve the most relevant workspace memory for the founder ask.

        Args:
            query: Natural-language search query for the current founder request.
        """

        hits = self.store.search_memory(query, selected_artifact_id=self.context.selected_artifact_id)
        self.context.memory_hits = self._merge_memory_hits(hits)
        content = "\n".join(f"- {item.title}: {item.summary}" for item in hits[:6]) or "- No relevant memory found."
        self._record_tool_call(
            name="retrieve_workspace_memory",
            summary=f"Retrieved {len(hits)} workspace memory item(s).",
            input_preview=query,
            output_preview=content,
        )
        return ServiceResponse(status=ServiceExecStatus.SUCCESS, content=content)

    def inspect_selected_artifact(self, artifact_id: Optional[str] = None) -> ServiceResponse:
        """Inspect a workspace artifact to ground the current thread.

        Args:
            artifact_id: Optional artifact id. If omitted, use the currently selected artifact.
        """

        resolved_artifact_id = artifact_id or self.context.selected_artifact_id
        if not resolved_artifact_id:
            return ServiceResponse(
                status=ServiceExecStatus.SUCCESS,
                content="No selected artifact is currently attached to the thread.",
            )
        artifact = self.store.get_artifact(resolved_artifact_id)
        preview = artifact.content[:2500]
        self._record_tool_call(
            name="inspect_selected_artifact",
            summary=f"Inspected artifact `{artifact.title}`.",
            input_preview=resolved_artifact_id,
            output_preview=preview,
            artifact_id=artifact.id,
        )
        return ServiceResponse(status=ServiceExecStatus.SUCCESS, content=preview)

    def run_workspace_skill(self, skill_id: str, objective: str) -> ServiceResponse:
        """Run a specific workspace skill to produce usable founder work.

        Args:
            skill_id: The skill id to execute.
            objective: The concrete work objective for this skill.
        """

        execution = self.skill_engine.run(
            skill_id=skill_id,
            founder_prompt=objective,
            memory_hits=self.context.memory_hits or self.store.search_memory(
                objective,
                selected_artifact_id=self.context.selected_artifact_id,
            ),
            workspace_name=self.store.workspace.company_name,
            founder_name=self.store.workspace.founder_name,
            selected_artifact_content=self._selected_artifact_content(),
        )
        self.context.skill_executions.append(execution)
        preview = execution.body[:2000]
        self._record_tool_call(
            name="run_workspace_skill",
            summary=f"Executed `{execution.title}`.",
            input_preview=f"{skill_id}\n\n{objective}",
            output_preview=preview,
            skill_id=skill_id,
        )
        return ServiceResponse(status=ServiceExecStatus.SUCCESS, content=preview)

    def launch_workspace_app(self, app_id: str, objective: str) -> ServiceResponse:
        """Launch a workspace app when the founder ask needs a deeper working surface.

        Args:
            app_id: The workspace app id to launch.
            objective: The objective for the app run.
        """

        app = self.store.get_app(app_id)
        executions: list[SkillExecution] = []
        for skill_id in app.skill_ids:
            executions.append(
                self.skill_engine.run(
                    skill_id=skill_id,
                    founder_prompt=objective,
                    memory_hits=self.context.memory_hits or self.store.search_memory(
                        objective,
                        selected_artifact_id=self.context.selected_artifact_id,
                    ),
                    workspace_name=self.store.workspace.company_name,
                    founder_name=self.store.workspace.founder_name,
                    selected_artifact_content=self._selected_artifact_content(),
                )
            )

        content = "\n\n".join(
            [f"# {app.title} Output"]
            + [f"## {execution.title}\n\n{execution.body}" for execution in executions]
        )
        artifact = self.store.upsert_artifact(
            title=f"{app.title} Output",
            module=ModuleKey.APPS,
            summary=f"{app.title} executed {len(executions)} skill(s) from the thread workspace.",
            content=content,
            kind=executions[0].artifact_kind if executions else self._default_artifact_kind(),
            linked_run_id=self.context.task_run_id,
        )

        self.context.skill_executions.extend(executions)
        self.context.launched_app = app
        self.context.output_artifact = artifact
        app.last_run_at = artifact.updated_at

        result_preview = f"Launched {app.title} and saved `{artifact.title}`."
        self._record_tool_call(
            name="launch_workspace_app",
            summary=result_preview,
            input_preview=f"{app_id}\n\n{objective}",
            output_preview=content[:2000],
            artifact_id=artifact.id,
            app_id=app.id,
        )
        self.store.persist()
        return ServiceResponse(status=ServiceExecStatus.SUCCESS, content=result_preview)

    def publish_to_investor_room(self, artifact_id: Optional[str] = None) -> ServiceResponse:
        """Publish the strongest artifact into the investor room when appropriate.

        Args:
            artifact_id: Optional artifact id. If omitted, use the latest output artifact.
        """

        resolved_artifact_id = artifact_id or (self.context.output_artifact.id if self.context.output_artifact else None)
        room = self.store.publish_investor_room(resolved_artifact_id)
        self.context.published_investor_room = True
        summary = f"Investor room now has {len(room.curated_artifact_ids)} curated artifact(s)."
        self._record_tool_call(
            name="publish_to_investor_room",
            summary="Published output to the investor room.",
            input_preview=resolved_artifact_id or "latest artifact",
            output_preview=summary,
            artifact_id=resolved_artifact_id,
        )
        return ServiceResponse(status=ServiceExecStatus.SUCCESS, content=summary)

    def summarize_execution(self) -> str:
        if self.context.launched_app and self.context.output_artifact:
            return (
                f"Launched {self.context.launched_app.title}, executed {len(self.context.skill_executions)} "
                f"tool-backed step(s), and saved `{self.context.output_artifact.title}`."
            )
        if self.context.skill_executions:
            return (
                f"Executed {len(self.context.skill_executions)} workspace skill(s) and prepared reusable founder output."
            )
        return "Worked from thread context without launching a deeper workspace action."

    def output_artifact(self) -> Optional[Artifact]:
        return self.context.output_artifact

    def launched_app_id(self) -> Optional[str]:
        return self.context.launched_app.id if self.context.launched_app else None

    def tool_calls(self) -> list[ToolCallRecord]:
        return list(self.context.tool_calls)

    def memory_hits(self) -> list[MemoryItem]:
        return list(self.context.memory_hits)

    def skill_executions(self) -> list[SkillExecution]:
        return list(self.context.skill_executions)

    def _default_artifact_kind(self):
        if self.context.selected_artifact_id:
            try:
                return self.store.get_artifact(self.context.selected_artifact_id).kind
            except KeyError:
                pass
        return self.store.artifacts[0].kind

    def _selected_artifact_content(self) -> Optional[str]:
        if not self.context.selected_artifact_id:
            return None
        try:
            return self.store.get_artifact(self.context.selected_artifact_id).content
        except KeyError:
            return None

    def _merge_memory_hits(self, hits: list[MemoryItem]) -> list[MemoryItem]:
        seen = {item.id for item in self.context.memory_hits}
        merged = list(self.context.memory_hits)
        for item in hits:
            if item.id not in seen:
                seen.add(item.id)
                merged.append(item)
        return merged

    def _record_tool_call(
        self,
        *,
        name: str,
        summary: str,
        input_preview: str,
        output_preview: str,
        artifact_id: str | None = None,
        app_id: str | None = None,
        skill_id: str | None = None,
    ) -> None:
        self.context.tool_calls.append(
            self.store.build_tool_call_record(
                name=name,
                status="completed",
                summary=summary,
                input_preview=input_preview,
                output_preview=output_preview,
                artifact_id=artifact_id,
                app_id=app_id,
                skill_id=skill_id,
            )
        )
