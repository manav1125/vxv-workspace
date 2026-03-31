import { Card, Tag } from "@agentscope-ai/design";

import type {
  AgentProfile,
  Contact,
  FundraisePipeline,
  Goal,
  KnowledgeSource,
  ModuleKey,
  TaskRun,
  WorkflowDefinition,
} from "../types";

interface ModuleBoardProps {
  activeModule: ModuleKey;
  goals: Goal[];
  agents: AgentProfile[];
  taskRuns: TaskRun[];
  workflows: WorkflowDefinition[];
  contacts: Contact[];
  knowledgeSources: KnowledgeSource[];
  fundraisePipeline: FundraisePipeline;
}

export function ModuleBoard({
  activeModule,
  goals,
  agents,
  taskRuns,
  workflows,
  contacts,
  knowledgeSources,
  fundraisePipeline,
}: ModuleBoardProps) {
  const filteredWorkflows = workflows.filter((workflow) => workflow.module === activeModule);
  const filteredTasks = taskRuns.filter((task) => task.module === activeModule);
  const filteredAgents = agents.filter((agent) => agent.module === activeModule);

  if (activeModule === "strategy") {
    return (
      <div className="module-grid">
        <Card title="Strategic goals">
          <div className="list-stack">
            {goals.map((goal) => (
              <div key={goal.id} className="list-row">
                <div>
                  <strong>{goal.title}</strong>
                  <p>{goal.kpi}</p>
                </div>
                <Tag color="cyan">{goal.status}</Tag>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Knowledge context">
          <div className="list-stack">
            {knowledgeSources.map((source) => (
              <div key={source.id} className="list-row">
                <div>
                  <strong>{source.title}</strong>
                  <p>{source.source_type}</p>
                </div>
                <Tag color="blue">{source.freshness}</Tag>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Suggested workflows">
          <div className="list-stack">
            {filteredWorkflows.map((workflow) => (
              <div key={workflow.id} className="workflow-card">
                <strong>{workflow.title}</strong>
                <p>{workflow.description}</p>
                <div className="tag-row">
                  {workflow.outputs.map((output) => (
                    <Tag key={output}>{output}</Tag>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeModule === "team") {
    return (
      <div className="module-grid">
        <Card title="Agent roster">
          <div className="list-stack">
            {agents.map((agent) => (
              <div key={agent.id} className="workflow-card">
                <strong>{agent.name}</strong>
                <p>{agent.summary}</p>
                <div className="tag-row">
                  <Tag color="geekblue">{agent.model}</Tag>
                  <Tag>{agent.budget}</Tag>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Tooling and guardrails">
          <div className="list-stack">
            {agents.map((agent) => (
              <div key={`${agent.id}-tools`} className="list-row">
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.tools.join(" · ")}</p>
                </div>
                <Tag color="magenta">{agent.permissions.length} perms</Tag>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeModule === "execution") {
    return (
      <div className="module-grid">
        <Card title="Live operating runs">
          <div className="list-stack">
            {filteredTasks.map((task) => (
              <div key={task.id} className="workflow-card">
                <strong>{task.title}</strong>
                <p>{task.trace_summary}</p>
                <div className="tag-row">
                  <Tag color={task.status === "waiting" ? "gold" : "green"}>{task.status}</Tag>
                  <Tag>{task.progress_label}</Tag>
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Execution workflows">
          <div className="list-stack">
            {filteredWorkflows.map((workflow) => (
              <div key={workflow.id} className="workflow-card">
                <strong>{workflow.title}</strong>
                <p>{workflow.description}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeModule === "capital") {
    return (
      <div className="module-grid">
        <Card title="Fundraise pipeline">
          <div className="panel-copy">
            <p className="eyebrow">{fundraisePipeline.round_name}</p>
            <h3>{fundraisePipeline.target_amount}</h3>
            <p>{fundraisePipeline.narrative}</p>
            <Tag color="lime">{fundraisePipeline.status}</Tag>
          </div>
        </Card>
        <Card title="Investors in motion">
          <div className="list-stack">
            {fundraisePipeline.investors.map((investor) => (
              <div key={investor.id} className="workflow-card">
                <strong>{investor.name}</strong>
                <p>{investor.thesis}</p>
                <div className="tag-row">
                  <Tag color="blue">{investor.relationship_status}</Tag>
                  <Tag>{investor.next_step}</Tag>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeModule === "artifacts") {
    return (
      <div className="module-grid">
        <Card title="Artifact operating model">
          <div className="panel-copy">
            <p>
              Every meaningful conversation should resolve into a reusable artifact,
              linked task run, and visible trace.
            </p>
            <div className="tag-row">
              <Tag>Plans</Tag>
              <Tag>Memos</Tag>
              <Tag>Investor updates</Tag>
              <Tag>Briefs</Tag>
            </div>
          </div>
        </Card>
        <Card title="People who receive outputs">
          <div className="list-stack">
            {contacts.map((contact) => (
              <div key={contact.id} className="list-row">
                <div>
                  <strong>{contact.name}</strong>
                  <p>{contact.company}</p>
                </div>
                <Tag color="purple">{contact.category}</Tag>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (activeModule === "inbox") {
    return (
      <div className="module-grid">
        <Card title="Approvals and interruptions">
          <div className="list-stack">
            {taskRuns
              .filter((task) => task.requires_approval)
              .map((task) => (
                <div key={task.id} className="workflow-card">
                  <strong>{task.title}</strong>
                  <p>{task.trace_summary}</p>
                  <Tag color="gold">Approval needed</Tag>
                </div>
              ))}
          </div>
        </Card>
        <Card title="Active operators">
          <div className="list-stack">
            {(filteredAgents.length > 0 ? filteredAgents : agents.slice(0, 3)).map((agent) => (
              <div key={agent.id} className="list-row">
                <div>
                  <strong>{agent.name}</strong>
                  <p>{agent.summary}</p>
                </div>
                <Tag color="green">{agent.model}</Tag>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="module-grid">
      <Card title="Module overview">
        <div className="panel-copy">
          <p>This module is ready to be connected to richer product-specific behaviors.</p>
        </div>
      </Card>
    </div>
  );
}
