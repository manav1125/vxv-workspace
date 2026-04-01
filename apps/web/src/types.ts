export type ModuleKey =
  | "inbox"
  | "strategy"
  | "team"
  | "execution"
  | "artifacts"
  | "capital"
  | "apps";

export type TaskStatus = "queued" | "running" | "waiting" | "completed" | "rejected";

export type ArtifactKind = "plan" | "memo" | "report" | "brief" | "deck" | "crm";

export type AppCategory =
  | "strategy"
  | "growth"
  | "operations"
  | "fundraising"
  | "hiring"
  | "research";

export interface Workspace {
  id: string;
  name: string;
  company_name: string;
  stage: string;
  mission: string;
  primary_kpi: string;
  founder_name: string;
  summary: string;
}

export interface Goal {
  id: string;
  title: string;
  owner: string;
  kpi: string;
  due_date: string;
  linked_agents: string[];
  status: string;
}

export interface AgentProfile {
  id: string;
  name: string;
  role: string;
  module: ModuleKey;
  model: string;
  tools: string[];
  budget: string;
  permissions: string[];
  escalation_rule: string;
  summary: string;
}

export interface KnowledgeSource {
  id: string;
  title: string;
  source_type: string;
  status: string;
  freshness: string;
}

export interface Contact {
  id: string;
  name: string;
  category: string;
  company: string;
  relationship_stage: string;
  last_touch: string;
}

export interface Artifact {
  id: string;
  title: string;
  kind: ArtifactKind;
  module: ModuleKey;
  updated_at: string;
  summary: string;
  content: string;
  linked_run_id?: string | null;
}

export interface TaskRun {
  id: string;
  title: string;
  status: TaskStatus;
  module: ModuleKey;
  owner_agent_id: string;
  progress_label: string;
  trace_summary: string;
  created_at: string;
  outputs: string[];
  requires_approval: boolean;
}

export interface FundraiseInvestor {
  id: string;
  name: string;
  thesis: string;
  stage_fit: string;
  relationship_status: string;
  next_step: string;
}

export interface FundraisePipeline {
  id: string;
  round_name: string;
  target_amount: string;
  status: string;
  narrative: string;
  investors: FundraiseInvestor[];
}

export interface InvestorRoom {
  id: string;
  title: string;
  visibility: string;
  headline: string;
  curated_artifact_ids: string[];
  diligence_items: string[];
  update_feed: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  author: string;
  module: ModuleKey;
  content: string;
  created_at: string;
  nodes: ThreadNode[];
  memory_hits: MemoryItem[];
  next_actions: string[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  status: string;
  summary: string;
  input_preview: string;
  output_preview: string;
  created_at: string;
  artifact_id?: string | null;
  app_id?: string | null;
  skill_id?: string | null;
}

export interface ThreadExecutionSession {
  id: string;
  thread_id: string;
  message_id?: string | null;
  module: ModuleKey;
  prompt: string;
  status: string;
  agent_id: string;
  created_at: string;
  updated_at: string;
  summary: string;
  selected_artifact_id?: string | null;
  task_run_id?: string | null;
  app_id?: string | null;
  output_artifact_ids: string[];
  tool_calls: ToolCallRecord[];
  response_excerpt?: string | null;
}

export interface WorkflowDefinition {
  id: string;
  title: string;
  module: ModuleKey;
  description: string;
  outputs: string[];
}

export interface SkillDefinition {
  id: string;
  name: string;
  summary: string;
  capability_type: string;
}

export interface WorkspaceApp {
  id: string;
  title: string;
  category: AppCategory;
  module: ModuleKey;
  summary: string;
  skill_ids: string[];
  artifact_outputs: string[];
  status: string;
  last_run_at?: string | null;
  featured: boolean;
}

export interface IntegrationStatus {
  agentscope_python_available: boolean;
  agentscope_configured: boolean;
  reme_available: boolean;
  runtime_target: string;
  mode: string;
  runtime_provider?: string | null;
  runtime_reason?: string | null;
}

export interface DashboardMetrics {
  active_goals: number;
  running_tasks: number;
  ready_artifacts: number;
  warm_investors: number;
}

export interface AuthSession {
  token: string;
  email: string;
  workspace_id: string;
  display_name: string;
  role: string;
}

export interface WorkspaceUser {
  email: string;
  workspace_id: string;
  display_name: string;
  role: string;
  status: string;
  created_at?: string | null;
  last_login_at?: string | null;
}

export interface UploadRecord {
  id: string;
  workspace_id: string;
  filename: string;
  stored_path: string;
  storage_backend: string;
  storage_url?: string | null;
  content_type?: string | null;
  created_at: string;
}

export interface MemoryItem {
  id: string;
  title: string;
  summary: string;
  kind: string;
  updated_at: string;
  source_id?: string | null;
  pinned?: boolean;
}

export interface BootstrapResponse {
  workspace: Workspace;
  goals: Goal[];
  agents: AgentProfile[];
  skills: SkillDefinition[];
  apps: WorkspaceApp[];
  knowledge_sources: KnowledgeSource[];
  contacts: Contact[];
  artifacts: Artifact[];
  task_runs: TaskRun[];
  workflows: WorkflowDefinition[];
  fundraise_pipeline: FundraisePipeline;
  investor_room: InvestorRoom;
  messages: ChatMessage[];
  memory_items: MemoryItem[];
  thread_executions: ThreadExecutionSession[];
  integrations: IntegrationStatus;
  metrics: DashboardMetrics;
}

export interface ChatRequest {
  module: ModuleKey;
  message: string;
  selected_artifact_id?: string;
}

export interface ChatResponse {
  reply: ChatMessage;
  active_agent: AgentProfile;
  task_run: TaskRun;
  artifact: Artifact;
  suggestions: string[];
  routed_module: ModuleKey;
  context_items: string[];
  next_actions: string[];
  nodes: ThreadNode[];
  memory_hits: MemoryItem[];
  thread_execution?: ThreadExecutionSession | null;
  launched_app_id?: string | null;
  updated_metrics: DashboardMetrics;
}

export interface ActionResponse {
  task_run: TaskRun;
  artifact?: Artifact | null;
  message: string;
}

export interface InvestorRoomActionResponse {
  investor_room: InvestorRoom;
  message: string;
}

export interface UploadResponse {
  upload: UploadRecord;
  knowledge_source: KnowledgeSource;
  artifact: Artifact;
  message: string;
}

export interface ThreadNode {
  id: string;
  kind: string;
  title: string;
  summary: string;
  status: string;
  expanded_by_default?: boolean;
  body?: string | null;
  bullet_points: string[];
  artifact_id?: string | null;
  task_run_id?: string | null;
  app_id?: string | null;
  thread_execution_id?: string | null;
  cta_label?: string | null;
}
