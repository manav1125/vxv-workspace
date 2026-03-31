import type {
  ActionResponse,
  Artifact,
  AuthSession,
  BootstrapResponse,
  ChatRequest,
  ChatResponse,
  InvestorRoomActionResponse,
  UploadResponse,
} from "../types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");
const authTokenKey = "vxv-auth-token";

function getAuthToken() {
  return window.localStorage.getItem(authTokenKey) ?? "";
}

export function setAuthToken(token: string) {
  window.localStorage.setItem(authTokenKey, token);
}

export function clearAuthToken() {
  window.localStorage.removeItem(authTokenKey);
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      ...(init?.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function login(email: string, password: string): Promise<AuthSession> {
  return api<AuthSession>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function fetchSession(): Promise<AuthSession> {
  return api<AuthSession>("/api/auth/session");
}

export function fetchBootstrap(): Promise<BootstrapResponse> {
  return api<BootstrapResponse>("/api/bootstrap");
}

export function updateWorkspace(payload: {
  company_name: string;
  founder_name: string;
  stage: string;
  mission: string;
  primary_kpi: string;
  summary: string;
}) {
  return api("/api/workspaces/current", {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createGoal(payload: {
  title: string;
  owner: string;
  kpi: string;
  due_date: string;
  linked_agents: string[];
  status: string;
}) {
  return api("/api/goals", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateGoal(goalId: string, status: string) {
  return api(`/api/goals/${goalId}`, {
    method: "PATCH",
    body: JSON.stringify({ status }),
  });
}

export function createKnowledgeSource(payload: {
  title: string;
  source_type: string;
  status: string;
  freshness: string;
}) {
  return api("/api/knowledge-sources", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateAgent(agentId: string, payload: {
  budget: string;
  permissions: string[];
  escalation_rule: string;
}) {
  return api(`/api/agents/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function createContact(payload: {
  name: string;
  category: string;
  company: string;
  relationship_stage: string;
  last_touch?: string;
}) {
  return api("/api/contacts", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function launchWorkflow(workflowId: string, note: string) {
  return api<ActionResponse>(`/api/workflows/${workflowId}/launch`, {
    method: "POST",
    body: JSON.stringify({ note }),
  });
}

export function createFundraiseInvestor(payload: {
  name: string;
  thesis: string;
  stage_fit: string;
  relationship_status: string;
  next_step: string;
}) {
  return api("/api/fundraise-pipeline/current/investors", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateFundraiseInvestor(
  investorId: string,
  payload: { relationship_status: string; next_step: string },
) {
  return api(`/api/fundraise-pipeline/current/investors/${investorId}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export function sendFounderMessage(payload: ChatRequest): Promise<ChatResponse> {
  return api<ChatResponse>("/api/chat", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function saveArtifact(artifactId: string, content: string) {
  return api<Artifact>(`/api/artifacts/${artifactId}`, {
    method: "PATCH",
    body: JSON.stringify({ content }),
  });
}

export function decideApproval(taskId: string, decision: "approve" | "request_revision" | "reject") {
  return api<ActionResponse>(`/api/task-runs/${taskId}/approval`, {
    method: "POST",
    body: JSON.stringify({ decision }),
  });
}

export function launchApp(appId: string, prompt: string) {
  return api<ActionResponse>(`/api/apps/${appId}/launch`, {
    method: "POST",
    body: JSON.stringify({ prompt }),
  });
}

export function publishInvestorRoom(artifactId?: string) {
  return api<InvestorRoomActionResponse>("/api/investor-room/publish", {
    method: "POST",
    body: JSON.stringify({ artifact_id: artifactId }),
  });
}

export function uploadDocument(file: File, module: string, title?: string) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("module", module);
  if (title) {
    formData.append("title", title);
  }

  return api<UploadResponse>("/api/uploads", {
    method: "POST",
    body: formData,
  });
}
