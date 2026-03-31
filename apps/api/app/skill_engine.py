from __future__ import annotations

from dataclasses import dataclass

from .models import ArtifactKind, MemoryItem, ModuleKey
from .runtime import AgentScopeRuntimeAdapter


@dataclass
class SkillExecution:
    skill_id: str
    title: str
    summary: str
    body: str
    artifact_title: str
    artifact_summary: str
    artifact_kind: ArtifactKind
    module: ModuleKey
    bullet_points: list[str]


class SkillEngine:
    def __init__(self, runtime: AgentScopeRuntimeAdapter) -> None:
        self.runtime = runtime

    def run(
        self,
        *,
        skill_id: str,
        founder_prompt: str,
        memory_hits: list[MemoryItem],
        workspace_name: str,
        founder_name: str,
        selected_artifact_content: str | None = None,
    ) -> SkillExecution:
        context_lines = [
            f"- {item.title}: {item.summary}"
            for item in memory_hits[:6]
        ]
        selected_artifact = selected_artifact_content[:3000] if selected_artifact_content else ""

        definitions = {
            "skill-market-synthesis": {
                "title": "Market synthesis",
                "summary": "Mapped relevant market, customer, and competitor context into a founder-ready decision brief.",
                "artifact_title": "Market Synthesis Brief",
                "artifact_summary": "Founder-ready market brief generated from workspace memory and current ask.",
                "artifact_kind": ArtifactKind.BRIEF,
                "module": ModuleKey.STRATEGY,
                "instruction": (
                    "Create a concise founder-grade market synthesis in markdown with sections: "
                    "Signal Summary, What Changed, Risks, Opportunities, and Recommended Moves."
                ),
                "fallback": (
                    "# Market Synthesis Brief\n\n"
                    "## Signal Summary\n"
                    "- Condense relevant workspace memory into the most important market shifts.\n\n"
                    "## Risks\n"
                    "- Identify where positioning or execution could drift.\n\n"
                    "## Recommended Moves\n"
                    "1. Clarify the wedge.\n"
                    "2. Tighten the next research loop.\n"
                    "3. Turn learnings into one artifact the team can act on.\n"
                ),
                "bullets": [
                    "Competitive posture clarified",
                    "Customer signal consolidated",
                    "Next strategic moves identified",
                ],
            },
            "skill-deck-review": {
                "title": "Pitch deck review",
                "summary": "Reviewed the fundraising narrative against investor expectations and workspace context.",
                "artifact_title": "Pitch Deck Review",
                "artifact_summary": "Investor-readiness review generated from the current deck context.",
                "artifact_kind": ArtifactKind.DECK,
                "module": ModuleKey.CAPITAL,
                "instruction": (
                    "Review the fundraising narrative in markdown with sections: Narrative Strengths, "
                    "Gaps, Investor Questions, and Priority Rewrites. Be concrete and crisp."
                ),
                "fallback": (
                    "# Pitch Deck Review\n\n"
                    "## Narrative Strengths\n"
                    "- Founder problem and operating-system vision are visible.\n\n"
                    "## Gaps\n"
                    "- Evidence and proof points still need tighter framing.\n\n"
                    "## Priority Rewrites\n"
                    "1. Sharpen the first three slides.\n"
                    "2. Quantify business impact earlier.\n"
                    "3. Tie the ask to investor confidence.\n"
                ),
                "bullets": [
                    "Narrative strengths surfaced",
                    "Top investor objections identified",
                    "Priority rewrites proposed",
                ],
            },
            "skill-diligence-pack": {
                "title": "Diligence pack assembly",
                "summary": "Compiled the current diligence state and investor-facing materials into one checklist.",
                "artifact_title": "Diligence Pack",
                "artifact_summary": "Investor room and diligence checklist assembled from current workspace materials.",
                "artifact_kind": ArtifactKind.MEMO,
                "module": ModuleKey.CAPITAL,
                "instruction": (
                    "Create a diligence checklist in markdown with sections: Ready Now, Missing, "
                    "Investor Questions to Pre-answer, and Publish Plan."
                ),
                "fallback": (
                    "# Diligence Pack\n\n"
                    "## Ready Now\n"
                    "- Current round narrative\n"
                    "- Latest investor-facing materials\n\n"
                    "## Missing\n"
                    "- One tighter operating update\n"
                    "- One cleaner artifact index\n\n"
                    "## Publish Plan\n"
                    "1. Curate the strongest artifacts.\n"
                    "2. Answer likely investor questions up front.\n"
                    "3. Publish to the investor room.\n"
                ),
                "bullets": [
                    "Diligence checklist compiled",
                    "Missing items highlighted",
                    "Investor-room publish plan prepared",
                ],
            },
            "skill-founder-review": {
                "title": "Founder review builder",
                "summary": "Turned the latest workspace activity into a weekly founder review.",
                "artifact_title": "Weekly Founder Review",
                "artifact_summary": "Weekly founder review assembled from live goals, runs, and memory.",
                "artifact_kind": ArtifactKind.PLAN,
                "module": ModuleKey.EXECUTION,
                "instruction": (
                    "Create a weekly founder review in markdown with sections: KPI Pulse, Wins, Risks, "
                    "Decisions Waiting, Delegations, and Next Week Focus."
                ),
                "fallback": (
                    "# Weekly Founder Review\n\n"
                    "## KPI Pulse\n"
                    "- Summarize the most important progress indicators.\n\n"
                    "## Decisions Waiting\n"
                    "- Highlight what still needs founder judgment.\n\n"
                    "## Next Week Focus\n"
                    "1. Resolve blockers.\n"
                    "2. Tighten the next artifact.\n"
                    "3. Delegate follow-through.\n"
                ),
                "bullets": [
                    "KPI pulse summarized",
                    "Founder decisions isolated",
                    "Next-week focus clarified",
                ],
            },
            "skill-persona-clustering": {
                "title": "Customer research synthesis",
                "summary": "Synthesized customer evidence into personas, pains, and message hooks.",
                "artifact_title": "Customer Research Synthesis",
                "artifact_summary": "Interview and research synthesis converted into a founder-usable brief.",
                "artifact_kind": ArtifactKind.BRIEF,
                "module": ModuleKey.STRATEGY,
                "instruction": (
                    "Create a customer research synthesis in markdown with sections: Personas, Core Pains, "
                    "Buying Triggers, Message Angles, and Open Questions."
                ),
                "fallback": (
                    "# Customer Research Synthesis\n\n"
                    "## Personas\n"
                    "- Cluster the clearest user types.\n\n"
                    "## Core Pains\n"
                    "- Highlight repeated pain patterns.\n\n"
                    "## Message Angles\n"
                    "1. State the strongest resonance points.\n"
                    "2. Note where claims still feel weak.\n"
                ),
                "bullets": [
                    "Personas clustered",
                    "Pain patterns synthesized",
                    "Messaging angles surfaced",
                ],
            },
            "skill-hiring-scorecard": {
                "title": "Hiring scorecard builder",
                "summary": "Created a scorecard and interview kit from the hiring context in the workspace.",
                "artifact_title": "Hiring Scorecard",
                "artifact_summary": "Role scorecard and interview kit generated from the current hiring need.",
                "artifact_kind": ArtifactKind.BRIEF,
                "module": ModuleKey.TEAM,
                "instruction": (
                    "Create a hiring scorecard in markdown with sections: Role Outcome, Core Competencies, "
                    "Interview Signals, Red Flags, and Decision Rubric."
                ),
                "fallback": (
                    "# Hiring Scorecard\n\n"
                    "## Role Outcome\n"
                    "- Define what success looks like in 90 days.\n\n"
                    "## Core Competencies\n"
                    "- List the capabilities this hire must show.\n\n"
                    "## Decision Rubric\n"
                    "1. Score evidence, not vibes.\n"
                    "2. Separate must-haves from nice-to-haves.\n"
                ),
                "bullets": [
                    "Role outcome clarified",
                    "Interview signals defined",
                    "Decision rubric drafted",
                ],
            },
        }

        if skill_id not in definitions:
            raise KeyError(f"Unknown skill: {skill_id}")

        definition = definitions[skill_id]
        body = definition["fallback"]
        if self.runtime.is_ready():
            try:
                system_prompt = (
                    f"You are executing the skill `{definition['title']}` inside {workspace_name}.\n"
                    f"Founder: {founder_name}\n"
                    "Be concrete, operational, and founder-grade. Use markdown headings and short bullets.\n"
                    f"{definition['instruction']}"
                )
                user_prompt = (
                    f"Founder request:\n{founder_prompt}\n\n"
                    f"Relevant memory:\n{chr(10).join(context_lines) or '- No memory retrieved'}\n\n"
                    f"Selected artifact context:\n{selected_artifact or 'None'}"
                )
                body = self.runtime.generate(
                    agent_name=definition["title"],
                    sys_prompt=system_prompt,
                    user_prompt=user_prompt,
                )
            except Exception:
                body = definition["fallback"]

        return SkillExecution(
            skill_id=skill_id,
            title=definition["title"],
            summary=definition["summary"],
            body=body,
            artifact_title=definition["artifact_title"],
            artifact_summary=definition["artifact_summary"],
            artifact_kind=definition["artifact_kind"],
            module=definition["module"],
            bullet_points=list(definition["bullets"]),
        )
