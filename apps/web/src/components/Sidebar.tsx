import { Avatar, Card, Tag } from "@agentscope-ai/design";

import type { DashboardMetrics, ModuleKey, Workspace } from "../types";

const moduleLabels: Record<ModuleKey, string> = {
  inbox: "Inbox",
  strategy: "Strategy",
  team: "Team",
  execution: "Execution",
  artifacts: "Artifacts",
  capital: "Capital",
};

interface SidebarProps {
  workspace: Workspace;
  metrics: DashboardMetrics;
  activeModule: ModuleKey;
  onSelectModule: (module: ModuleKey) => void;
}

export function Sidebar({
  workspace,
  metrics,
  activeModule,
  onSelectModule,
}: SidebarProps) {
  const moduleEntries = Object.entries(moduleLabels) as [ModuleKey, string][];

  return (
    <aside className="shell-sidebar glass-panel">
      <div className="brand-lockup">
        <div>
          <p className="eyebrow">Unified Founder OS</p>
          <h1>{workspace.name}</h1>
        </div>
        <Avatar>VX</Avatar>
      </div>

      <p className="sidebar-summary">{workspace.summary}</p>

      <nav className="module-nav" aria-label="Workspace modules">
        {moduleEntries.map(([module, label]) => (
          <button
            key={module}
            className={`module-button ${activeModule === module ? "active" : ""}`}
            onClick={() => onSelectModule(module)}
            type="button"
          >
            <span>{label}</span>
            <span className="module-button-meta">
              {module === "inbox" && metrics.running_tasks}
              {module === "strategy" && metrics.active_goals}
              {module === "team" && 6}
              {module === "execution" && metrics.running_tasks}
              {module === "artifacts" && metrics.ready_artifacts}
              {module === "capital" && metrics.warm_investors}
            </span>
          </button>
        ))}
      </nav>

      <Card title="Founder context" className="sidebar-card">
        <div className="sidebar-stack">
          <Tag color="gold">{workspace.stage}</Tag>
          <div>
            <p className="sidebar-label">Company</p>
            <strong>{workspace.company_name}</strong>
          </div>
          <div>
            <p className="sidebar-label">Primary KPI</p>
            <strong>{workspace.primary_kpi}</strong>
          </div>
          <div>
            <p className="sidebar-label">Founder</p>
            <strong>{workspace.founder_name}</strong>
          </div>
        </div>
      </Card>
    </aside>
  );
}
