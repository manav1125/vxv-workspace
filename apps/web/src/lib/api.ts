import type {
  ActionResponse,
  Artifact,
  BootstrapResponse,
  ChatRequest,
  ChatResponse,
} from "../types";

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export function fetchBootstrap(): Promise<BootstrapResponse> {
  return api<BootstrapResponse>("/api/bootstrap");
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
