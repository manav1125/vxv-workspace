import { Card, PromptsEditor, Tabs, Tag } from "@agentscope-ai/design";
import { Markdown, StatusCard } from "@agentscope-ai/chat";

import type { AgentProfile, Artifact, InvestorRoom, TaskRun } from "../types";

interface InspectorPanelProps {
  selectedArtifact: Artifact | undefined;
  selectedArtifactDraft: string;
  onChangeArtifactDraft: (value: string) => void;
  onSelectArtifact: (artifactId: string) => void;
  artifacts: Artifact[];
  taskRuns: TaskRun[];
  agents: AgentProfile[];
  investorRoom: InvestorRoom;
}

export function InspectorPanel({
  selectedArtifact,
  selectedArtifactDraft,
  onChangeArtifactDraft,
  onSelectArtifact,
  artifacts,
  taskRuns,
  agents,
  investorRoom,
}: InspectorPanelProps) {
  const ownerName = (agentId: string) =>
    agents.find((agent) => agent.id === agentId)?.name ?? "Unknown agent";

  return (
    <aside className="inspector-panel glass-panel">
      <Card title="Run visibility" className="inspector-section">
        <div className="status-stack">
          {taskRuns.slice(0, 3).map((task) => (
            <StatusCard
              key={task.id}
              title={task.title}
              status={
                task.status === "completed"
                  ? "success"
                  : task.status === "waiting"
                    ? "warning"
                    : "info"
              }
              description={`${ownerName(task.owner_agent_id)} · ${task.progress_label}`}
            >
              <p className="status-trace">{task.trace_summary}</p>
            </StatusCard>
          ))}
        </div>
      </Card>

      <Card title="Artifact inspector" className="inspector-section">
        <div className="artifact-list">
          {artifacts.slice(0, 5).map((artifact) => (
            <button
              key={artifact.id}
              className={`artifact-link ${artifact.id === selectedArtifact?.id ? "active" : ""}`}
              onClick={() => onSelectArtifact(artifact.id)}
              type="button"
            >
              <span>{artifact.title}</span>
              <Tag>{artifact.kind}</Tag>
            </button>
          ))}
        </div>

        {selectedArtifact ? (
          <Tabs
            items={[
              {
                key: "preview",
                label: "Preview",
                children: <Markdown content={selectedArtifactDraft} />,
              },
              {
                key: "edit",
                label: "Edit",
                children: (
                  <PromptsEditor
                    value={selectedArtifactDraft}
                    height="360px"
                    onChange={(value) => onChangeArtifactDraft(value)}
                    tipsText={false}
                  />
                ),
              },
            ]}
          />
        ) : null}
      </Card>

      <Card title="Investor room snapshot" className="inspector-section">
        <div className="panel-copy">
          <p className="eyebrow">{investorRoom.visibility}</p>
          <h3>{investorRoom.title}</h3>
          <p>{investorRoom.headline}</p>
          <div className="tag-row">
            {investorRoom.diligence_items.map((item) => (
              <Tag key={item}>{item}</Tag>
            ))}
          </div>
        </div>
      </Card>
    </aside>
  );
}
