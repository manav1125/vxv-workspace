import { useEffect, useMemo, useState } from "react";

import { MarkdownRenderer } from "./components/MarkdownRenderer";
import {
  clearAuthToken,
  createMcpConnector,
  createThread,
  decideApproval,
  fetchBootstrap,
  fetchSession,
  fetchUploads,
  launchApp,
  login,
  publishInvestorRoom,
  saveArtifact,
  sendFounderMessage,
  setAuthToken,
  toggleSkill,
  toggleTool,
  updateMcpConnector,
  updateWorkspace,
  uploadDocument,
} from "./lib/api";
import type {
  AppCategory,
  Artifact,
  AuthSession,
  BootstrapResponse,
  MCPConnector,
  MemoryItem,
  ModuleKey,
  ThreadExecutionSession,
  ThreadNode,
  UploadRecord,
} from "./types";

type PanelState = "artifact" | "app" | "workspace" | null;

const focusOptions: Array<{ key: ModuleKey; label: string; summary: string }> = [
  { key: "inbox", label: "General", summary: "Route work and coordinate the right agent." },
  { key: "strategy", label: "Strategy", summary: "Research, positioning, and market synthesis." },
  { key: "execution", label: "Execution", summary: "Cadences, reviews, blockers, and follow-through." },
  { key: "capital", label: "Capital", summary: "Decks, investor updates, diligence, and room publishing." },
  { key: "apps", label: "Apps", summary: "Force a deeper multi-step app run from chat." },
];

const demoPrompts: Array<{ label: string; module: ModuleKey; prompt: string }> = [
  {
    label: "Deck audit",
    module: "capital",
    prompt: "Review the latest pitch deck, call the right skills, and prepare a founder-ready investor update.",
  },
  {
    label: "Weekly review",
    module: "execution",
    prompt: "Build this week's founder review with KPI pulse, blockers, decisions waiting, and next moves.",
  },
  {
    label: "Research sprint",
    module: "strategy",
    prompt: "Synthesize customer signals, competitor movement, and message angles into a market brief.",
  },
];

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "Now";
  }
  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function categoryLabel(value: AppCategory) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function moduleLabel(value: ModuleKey) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function displayName(value: string) {
  return value.replace(/^skill-/, "").replaceAll("_", " ").replaceAll("-", " ");
}

function formatRuntimeMode(mode: string) {
  return mode.replaceAll("-", " ");
}

function uniqueMemory(items: MemoryItem[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

function App() {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [isLaunchingApp, setIsLaunchingApp] = useState(false);
  const [isPublishingRoom, setIsPublishingRoom] = useState(false);
  const [isUpdatingWorkspace, setIsUpdatingWorkspace] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [panel, setPanel] = useState<PanelState>(null);
  const [memoryOpen, setMemoryOpen] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [focusModule, setFocusModule] = useState<ModuleKey>("inbox");
  const [composerDraft, setComposerDraft] = useState("");
  const [appPrompt, setAppPrompt] = useState("");
  const [artifactDraft, setArtifactDraft] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedExecutionId, setSelectedExecutionId] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState("thread-primary");
  const [newThreadTitle, setNewThreadTitle] = useState("");
  const [connectorForm, setConnectorForm] = useState({
    name: "",
    transport: "sse",
    url: "",
    command: "",
  });

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loginForm, setLoginForm] = useState({
    email: "founder@vxv.network",
    password: "vxv-demo",
  });
  const [workspaceForm, setWorkspaceForm] = useState({
    company_name: "",
    founder_name: "",
    stage: "",
    mission: "",
    primary_kpi: "",
    summary: "",
  });

  const loadWorkspace = async (options?: { artifactId?: string; appId?: string; executionId?: string; threadId?: string }) => {
    const [bootstrap, latestUploads] = await Promise.all([fetchBootstrap(), fetchUploads()]);
    setData(bootstrap);
    setUploads(latestUploads);
    const availableThreadIds = new Set(bootstrap.threads.map((thread) => thread.id));
    const requestedThreadId = options?.threadId || selectedThreadId || bootstrap.active_thread_id;
    const nextThreadId = availableThreadIds.has(requestedThreadId) ? requestedThreadId : bootstrap.active_thread_id;
    setSelectedThreadId(nextThreadId);

    const nextArtifact =
      bootstrap.artifacts.find((artifact) => artifact.id === options?.artifactId) ??
      bootstrap.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      bootstrap.artifacts[0];
    if (nextArtifact) {
      setSelectedArtifactId(nextArtifact.id);
      setArtifactDraft(nextArtifact.content);
    }

    const nextApp =
      bootstrap.apps.find((app) => app.id === options?.appId) ??
      bootstrap.apps.find((app) => app.id === selectedAppId) ??
      bootstrap.apps.find((app) => app.featured) ??
      bootstrap.apps[0];
    if (nextApp) {
      setSelectedAppId(nextApp.id);
      setAppPrompt((current) => current || `Run ${nextApp.title.toLowerCase()} on the latest workspace context.`);
    }

    const nextExecution =
      bootstrap.thread_executions.find((execution) => execution.id === options?.executionId) ??
      bootstrap.thread_executions.find((execution) => execution.app_id === options?.appId) ??
      bootstrap.thread_executions.find((execution) => execution.thread_id === nextThreadId) ??
      bootstrap.thread_executions.find((execution) => execution.id === selectedExecutionId) ??
      bootstrap.thread_executions[0];
    if (nextExecution) {
      setSelectedExecutionId(nextExecution.id);
    }

    setWorkspaceForm({
      company_name: bootstrap.workspace.company_name,
      founder_name: bootstrap.workspace.founder_name,
      stage: bootstrap.workspace.stage,
      mission: bootstrap.workspace.mission,
      primary_kpi: bootstrap.workspace.primary_kpi,
      summary: bootstrap.workspace.summary,
    });
  };

  useEffect(() => {
    const boot = async () => {
      try {
        setIsLoading(true);
        const nextSession = await fetchSession();
        setSession(nextSession);
        await loadWorkspace();
      } catch {
        clearAuthToken();
        setSession(null);
        setData(null);
      } finally {
        setIsLoading(false);
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    if (!session) {
      setShowOnboarding(false);
      return;
    }
    const onboardingKey = `agentscope-chat-onboarding:${session.workspace_id}`;
    setShowOnboarding(window.localStorage.getItem(onboardingKey) !== "true");
  }, [session]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const allMessages = data?.messages ?? [];
  const threads = data?.threads ?? [];
  const artifacts = data?.artifacts ?? [];
  const apps = data?.apps ?? [];
  const allThreadExecutions = data?.thread_executions ?? [];
  const activeThreadId = selectedThreadId || data?.active_thread_id || "thread-primary";
  const messages = allMessages.filter((message) => message.thread_id === activeThreadId);
  const threadExecutions = allThreadExecutions.filter((execution) => execution.thread_id === activeThreadId);
  const focusSummary = focusOptions.find((option) => option.key === focusModule)?.summary ?? "";

  const artifactById = useMemo(() => new Map(artifacts.map((artifact) => [artifact.id, artifact])), [artifacts]);
  const appById = useMemo(() => new Map(apps.map((app) => [app.id, app])), [apps]);
  const agentById = useMemo(() => new Map((data?.agents ?? []).map((agent) => [agent.id, agent])), [data?.agents]);
  const taskById = useMemo(
    () => new Map((data?.task_runs ?? []).map((task) => [task.id, task])),
    [data?.task_runs],
  );
  const executionByMessageId = useMemo(
    () =>
      new Map(
        threadExecutions
          .filter((execution) => execution.message_id)
          .map((execution) => [execution.message_id as string, execution]),
      ),
    [threadExecutions],
  );

  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const latestAssistantExecution = latestAssistantMessage
    ? executionByMessageId.get(latestAssistantMessage.id) ?? null
    : null;
  const latestMemoryHits = latestAssistantMessage?.memory_hits ?? [];
  const latestActions = latestAssistantMessage?.next_actions ?? [];

  const selectedArtifact = artifactById.get(selectedArtifactId) ?? artifacts[0] ?? null;
  const selectedApp =
    appById.get(selectedAppId) ?? apps.find((app) => app.featured) ?? apps[0] ?? null;
  const selectedExecution =
    threadExecutions.find((execution) => execution.id === selectedExecutionId) ??
    (selectedApp ? threadExecutions.find((execution) => execution.app_id === selectedApp.id) : null) ??
    latestAssistantExecution ??
    threadExecutions[0] ??
    null;

  const selectedExecutionAgent = selectedExecution ? agentById.get(selectedExecution.agent_id) ?? null : null;
  const selectedExecutionTask = selectedExecution?.task_run_id
    ? taskById.get(selectedExecution.task_run_id) ?? null
    : null;
  const selectedExecutionArtifacts = (selectedExecution?.output_artifact_ids ?? [])
    .map((artifactId) => artifactById.get(artifactId))
    .filter((artifact): artifact is Artifact => Boolean(artifact));
  const selectedExecutionSkills = Array.from(
    new Set(
      (selectedExecution?.tool_calls ?? [])
        .map((toolCall) => toolCall.skill_id)
        .filter((skillId): skillId is string => Boolean(skillId)),
    ),
  );

  const sidecarItems = useMemo(
    () => uniqueMemory([...latestMemoryHits, ...(data?.memory_items ?? [])]),
    [data?.memory_items, latestMemoryHits],
  );

  const readyApps = useMemo(() => apps.filter((app) => app.status === "ready"), [apps]);
  const featuredApps = useMemo(
    () => readyApps.filter((app) => app.featured).concat(readyApps.filter((app) => !app.featured)).slice(0, 4),
    [readyApps],
  );
  const builtinTools = (data?.tool_catalog ?? []).filter((tool) => tool.source === "builtin");
  const mcpTools = (data?.tool_catalog ?? []).filter((tool) => tool.source === "mcp");
  const mcpConnectors = data?.mcp_connectors ?? [];
  const selectedThread = threads.find((thread) => thread.id === activeThreadId) ?? threads[0] ?? null;

  const handleLogin = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);
      const nextSession = await login(loginForm.email, loginForm.password);
      setAuthToken(nextSession.token);
      setSession(nextSession);
      await loadWorkspace();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to log in");
    } finally {
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      setIsUpdatingWorkspace(true);
      setError(null);
      await updateWorkspace(workspaceForm);
      await loadWorkspace({ threadId: activeThreadId });
      if (session) {
        window.localStorage.setItem(`agentscope-chat-onboarding:${session.workspace_id}`, "true");
      }
      setShowOnboarding(false);
      setNotice("Workspace context saved. The chat now has better grounding.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update workspace");
    } finally {
      setIsUpdatingWorkspace(false);
    }
  };

  const handleCreateThread = async () => {
    try {
      setError(null);
      const title = newThreadTitle.trim() || `Thread ${new Date().toLocaleString([], { month: "short", day: "numeric" })}`;
      const thread = await createThread(title);
      setNewThreadTitle("");
      await loadWorkspace({ threadId: thread.id });
      setNotice("New thread created.");
    } catch (threadError) {
      setError(threadError instanceof Error ? threadError.message : "Unable to create thread");
    }
  };

  const handleToggleSkill = async (skillId: string, enabled: boolean) => {
    try {
      setError(null);
      await toggleSkill(skillId, enabled);
      await loadWorkspace({ threadId: activeThreadId });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update skill");
    }
  };

  const handleToggleTool = async (toolName: string, enabled: boolean) => {
    try {
      setError(null);
      await toggleTool(toolName, enabled);
      await loadWorkspace({ threadId: activeThreadId });
    } catch (toggleError) {
      setError(toggleError instanceof Error ? toggleError.message : "Unable to update tool");
    }
  };

  const handleAddConnector = async () => {
    if (!connectorForm.name.trim()) {
      setError("Connector name is required.");
      return;
    }
    if (connectorForm.transport === "sse" && !connectorForm.url.trim()) {
      setError("Connector URL is required for SSE transport.");
      return;
    }
    try {
      setError(null);
      await createMcpConnector({
        name: connectorForm.name.trim(),
        transport: connectorForm.transport,
        url: connectorForm.url.trim() || undefined,
        command: connectorForm.command.trim() || undefined,
      });
      setConnectorForm({ name: "", transport: "sse", url: "", command: "" });
      await loadWorkspace({ threadId: activeThreadId });
      setNotice("MCP connector saved.");
    } catch (connectorError) {
      setError(connectorError instanceof Error ? connectorError.message : "Unable to save MCP connector");
    }
  };

  const handleToggleConnector = async (connector: MCPConnector, enabled: boolean) => {
    try {
      setError(null);
      await updateMcpConnector(connector.id, { enabled });
      await loadWorkspace({ threadId: activeThreadId });
    } catch (connectorError) {
      setError(connectorError instanceof Error ? connectorError.message : "Unable to update connector");
    }
  };

  const handleSendMessage = async (message: string, moduleOverride?: ModuleKey) => {
    if (!message.trim()) {
      return;
    }

    try {
      setIsSending(true);
      setError(null);
      const response = await sendFounderMessage({
        module: moduleOverride ?? focusModule,
        message: message.trim(),
        selected_artifact_id: selectedArtifactId || undefined,
        thread_id: activeThreadId,
      });

      setComposerDraft("");
      setSelectedArtifactId(response.artifact.id);
      if (response.launched_app_id) {
        setSelectedAppId(response.launched_app_id);
      }
      if (response.thread_execution?.id) {
        setSelectedExecutionId(response.thread_execution.id);
      }
      await loadWorkspace({
        artifactId: response.artifact.id,
        appId: response.launched_app_id ?? undefined,
        executionId: response.thread_execution?.id ?? undefined,
        threadId: activeThreadId,
      });
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile) {
      return;
    }
    try {
      setIsUploading(true);
      setError(null);
      const response = await uploadDocument(uploadFile, focusModule, uploadTitle || undefined);
      setSelectedArtifactId(response.artifact.id);
      setPanel("artifact");
      setUploadOpen(false);
      setUploadFile(null);
      setUploadTitle("");
      setNotice("Document added to workspace memory.");
      await loadWorkspace({ artifactId: response.artifact.id, threadId: activeThreadId });
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveArtifact = async () => {
    if (!selectedArtifact) {
      return;
    }
    try {
      setIsSavingArtifact(true);
      setError(null);
      await saveArtifact(selectedArtifact.id, artifactDraft);
      setNotice("Artifact saved.");
      await loadWorkspace({ artifactId: selectedArtifact.id, threadId: activeThreadId });
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artifact");
    } finally {
      setIsSavingArtifact(false);
    }
  };

  const handleLaunchApp = async () => {
    if (!selectedApp || !appPrompt.trim()) {
      return;
    }
    try {
      setIsLaunchingApp(true);
      setError(null);
      const response = await launchApp(selectedApp.id, appPrompt.trim());
      setSelectedArtifactId(response.artifact?.id ?? selectedArtifactId);
      setPanel("app");
      setNotice(response.message);
      await loadWorkspace({
        artifactId: response.artifact?.id ?? selectedArtifactId,
        appId: selectedApp.id,
        threadId: activeThreadId,
      });
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Unable to launch app");
    } finally {
      setIsLaunchingApp(false);
    }
  };

  const handleApproval = async (taskId: string, decision: "approve" | "request_revision" | "reject") => {
    try {
      setError(null);
      await decideApproval(taskId, decision);
      setNotice(decision === "approve" ? "Approval recorded." : "Approval state updated.");
      await loadWorkspace({ artifactId: selectedArtifactId, appId: selectedAppId, executionId: selectedExecutionId, threadId: activeThreadId });
    } catch (approvalError) {
      setError(approvalError instanceof Error ? approvalError.message : "Unable to update approval");
    }
  };

  const handlePublishInvestorRoom = async () => {
    if (!selectedArtifact) {
      return;
    }
    try {
      setIsPublishingRoom(true);
      setError(null);
      await publishInvestorRoom(selectedArtifact.id);
      setNotice("Investor room updated.");
      await loadWorkspace({ artifactId: selectedArtifact.id, threadId: activeThreadId });
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish the investor room");
    } finally {
      setIsPublishingRoom(false);
    }
  };

  const handleNodeAction = (node: ThreadNode) => {
    const linkedExecution = node.thread_execution_id
      ? threadExecutions.find((execution) => execution.id === node.thread_execution_id) ?? null
      : null;

    if (node.thread_execution_id) {
      setSelectedExecutionId(node.thread_execution_id);
    }
    if (node.artifact_id) {
      setSelectedArtifactId(node.artifact_id);
      setPanel("artifact");
      return;
    }
    if (node.app_id) {
      setSelectedAppId(node.app_id);
      setPanel("app");
      return;
    }
    if (linkedExecution?.app_id) {
      setSelectedAppId(linkedExecution.app_id);
      setPanel("app");
      return;
    }
    if (node.task_run_id && node.kind === "approval") {
      setPanel("workspace");
      return;
    }
    if (node.kind === "run") {
      setPanel(linkedExecution ? "app" : "workspace");
    }
  };

  const openExecution = (execution: ThreadExecutionSession) => {
    setSelectedExecutionId(execution.id);
    setSelectedThreadId(execution.thread_id);
    if (execution.app_id) {
      setSelectedAppId(execution.app_id);
    }
    if (execution.output_artifact_ids[0]) {
      setSelectedArtifactId(execution.output_artifact_ids[0]);
    }
  };

  if (isLoading) {
    return <div className="app-state">Loading AgentScope Chat…</div>;
  }

  if (!session || !data) {
    return (
      <div className="login-screen">
        <div className="login-card-simple">
          <p className="eyebrow">AgentScope Chat Demo</p>
          <h1>Tool calling, skills, MCP, and artifacts in one thread.</h1>
          <p className="lede">
            This demo keeps the existing workspace backend but presents it as a single AgentScope command
            console with visible execution traces.
          </p>
          <div className="hero-chip-row">
            <span className="hero-chip">ReAct chat</span>
            <span className="hero-chip">Skill orchestration</span>
            <span className="hero-chip">MCP-ready runtime</span>
          </div>
          <label className="field-stack">
            <span>Email</span>
            <input
              value={loginForm.email}
              onChange={(event) => setLoginForm((current) => ({ ...current, email: event.target.value }))}
            />
          </label>
          <label className="field-stack">
            <span>Password</span>
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) => setLoginForm((current) => ({ ...current, password: event.target.value }))}
            />
          </label>
          {error ? <p className="status-error">{error}</p> : null}
          <button className="button-primary" onClick={() => void handleLogin()} disabled={isAuthenticating}>
            {isAuthenticating ? "Entering demo…" : "Enter AgentScope Chat"}
          </button>
        </div>
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-card">
          <div className="onboarding-copy">
            <p className="eyebrow">Ground the runtime</p>
            <h1>Give the demo enough context to feel like a real operating layer.</h1>
            <p className="lede">
              The better this context is, the stronger the chat looks when it routes through memory, skills,
              app launches, and artifact creation during your demo.
            </p>
            <div className="hero-chip-row">
              {demoPrompts.map((prompt) => (
                <span key={prompt.label} className="hero-chip">
                  {prompt.label}
                </span>
              ))}
            </div>
          </div>
          <div className="onboarding-form">
            <label className="field-stack">
              <span>Company name</span>
              <input
                value={workspaceForm.company_name}
                onChange={(event) =>
                  setWorkspaceForm((current) => ({ ...current, company_name: event.target.value }))
                }
              />
            </label>
            <div className="grid-two">
              <label className="field-stack">
                <span>Founder</span>
                <input
                  value={workspaceForm.founder_name}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, founder_name: event.target.value }))
                  }
                />
              </label>
              <label className="field-stack">
                <span>Stage</span>
                <input
                  value={workspaceForm.stage}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, stage: event.target.value }))
                  }
                />
              </label>
            </div>
            <label className="field-stack">
              <span>Primary KPI</span>
              <input
                value={workspaceForm.primary_kpi}
                onChange={(event) =>
                  setWorkspaceForm((current) => ({ ...current, primary_kpi: event.target.value }))
                }
              />
            </label>
            <label className="field-stack">
              <span>Mission</span>
              <textarea
                value={workspaceForm.mission}
                onChange={(event) => setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))}
              />
            </label>
            <label className="field-stack">
              <span>Operating summary</span>
              <textarea
                value={workspaceForm.summary}
                onChange={(event) => setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))}
              />
            </label>
            {error ? <p className="status-error">{error}</p> : null}
            <button
              className="button-primary"
              onClick={() => void completeOnboarding()}
              disabled={isUpdatingWorkspace}
            >
              {isUpdatingWorkspace ? "Saving…" : "Enter demo workspace"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app-shell">
      <main className="chat-main">
        <header className="workspace-hero compact">
          <div className="workspace-hero-copy">
            <p className="workspace-label">{data.workspace.company_name}</p>
            <h1>Founder Chat</h1>
            <p className="lede">Ask in chat. Review actions and outputs on the right. Keep each experiment in its own thread.</p>
          </div>
          <div className="hero-stat-grid">
            <div className="hero-stat">
              <span>Thread</span>
              <strong>{selectedThread?.title ?? "Primary thread"}</strong>
            </div>
            <div className="hero-stat">
              <span>Messages</span>
              <strong>{selectedThread?.message_count ?? messages.length}</strong>
            </div>
            <div className="hero-stat">
              <span>Runtime</span>
              <strong>{formatRuntimeMode(data.integrations.mode)}</strong>
            </div>
            <div className="hero-stat">
              <span>MCP</span>
              <strong>{data.integrations.mcp_server_count} connector(s)</strong>
            </div>
          </div>
        </header>

        {notice ? <p className="status-notice">{notice}</p> : null}
        {error ? <p className="status-error">{error}</p> : null}

        <div className="console-layout">
          <section className="chat-column">
            <div className="chat-surface">
              <div className="thread-topbar">
                <div>
                  <p className="section-kicker">Thread</p>
                  <h2>Chat console</h2>
                  <p className="panel-summary">{focusSummary}</p>
                </div>
                <div className="thread-topbar-controls">
                  <label className="lens-select thread-select">
                    <span>Thread</span>
                    <select
                      value={activeThreadId}
                      onChange={(event) => {
                        const nextThread = event.target.value;
                        setSelectedThreadId(nextThread);
                        setSelectedExecutionId("");
                      }}
                    >
                      {threads.map((thread) => (
                        <option key={thread.id} value={thread.id}>
                          {thread.title} ({thread.message_count})
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="thread-create">
                    <input
                      value={newThreadTitle}
                      onChange={(event) => setNewThreadTitle(event.target.value)}
                      placeholder="New thread name"
                    />
                    <button className="button-secondary" onClick={() => void handleCreateThread()}>
                      New thread
                    </button>
                  </div>
                  <label className="lens-select">
                    <span>Operating lens</span>
                    <select value={focusModule} onChange={(event) => setFocusModule(event.target.value as ModuleKey)}>
                      {focusOptions.map((option) => (
                        <option key={option.key} value={option.key}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button className="button-secondary" onClick={() => setPanel("app")}>
                    Open app studio
                  </button>
                  <button className="button-secondary" onClick={() => setPanel("workspace")}>
                    Settings
                  </button>
                  <button className="button-secondary" onClick={() => setMemoryOpen((current) => !current)}>
                    {memoryOpen ? "Hide memory" : "Show memory"}
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => {
                      clearAuthToken();
                      setSession(null);
                      setData(null);
                    }}
                  >
                    Log out
                  </button>
                </div>
              </div>

              <div className="context-ribbon">
                <span className="hero-chip">Thread: {selectedThread?.title ?? "Primary thread"}</span>
                <span className="hero-chip">Selected artifact: {selectedArtifact?.title ?? "None"}</span>
                <span className="hero-chip">Active app: {selectedApp?.title ?? "None"}</span>
              </div>

              <div className="thread-stream">
                {messages.length === 0 ? (
                  <article className="thread-message is-assistant">
                    <div className="message-header">
                      <div>
                        <strong>ChiefOfStaffAgent</strong>
                        <span className="message-module">Inbox</span>
                      </div>
                    </div>
                    <p className="panel-summary">This thread is clean. Ask anything to start a fresh run.</p>
                  </article>
                ) : null}
                {messages.map((message) => {
                  const linkedExecution = executionByMessageId.get(message.id) ?? null;
                  const linkedAgent = linkedExecution ? agentById.get(linkedExecution.agent_id) ?? null : null;
                  const linkedArtifacts = (linkedExecution?.output_artifact_ids ?? [])
                    .map((artifactId) => artifactById.get(artifactId))
                    .filter((artifact): artifact is Artifact => Boolean(artifact));
                  const nodes = message.nodes ?? [];
                  const memoryHits = message.memory_hits ?? [];

                  return (
                    <article
                      key={message.id}
                      className={`thread-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
                    >
                      <div className="message-header">
                        <div>
                          <strong>{message.author}</strong>
                          <span className="message-module">{moduleLabel(message.module)}</span>
                        </div>
                        <span>{formatTimestamp(message.created_at)}</span>
                      </div>

                      <MarkdownRenderer content={message.content} />

                      {linkedExecution ? (
                        <div className="execution-inline">
                          <div className="execution-inline-header">
                            <div>
                              <p className="node-kind">Execution trace</p>
                              <h3>{linkedExecution.summary}</h3>
                            </div>
                            <button className="button-secondary" onClick={() => openExecution(linkedExecution)}>
                              Inspect run
                            </button>
                          </div>
                          <div className="execution-badges">
                            <span className="mini-tag">{linkedAgent?.name ?? linkedExecution.agent_id}</span>
                            <span className="mini-tag">{linkedExecution.tool_calls.length} tool call(s)</span>
                            {linkedExecution.app_id ? (
                              <span className="mini-tag">
                                App: {appById.get(linkedExecution.app_id)?.title ?? linkedExecution.app_id}
                              </span>
                            ) : null}
                          </div>
                          {linkedExecution.tool_calls.length ? (
                            <div className="tool-chip-row">
                              {linkedExecution.tool_calls.map((toolCall) => (
                                <span key={toolCall.id} className="tool-chip">
                                  {displayName(toolCall.name)}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          {linkedArtifacts.length ? (
                            <div className="linked-artifacts-row">
                              {linkedArtifacts.map((artifact) => (
                                <button
                                  key={artifact.id}
                                  className="mini-record mini-record-button"
                                  onClick={() => {
                                    setSelectedArtifactId(artifact.id);
                                    setPanel("artifact");
                                  }}
                                >
                                  <strong>{artifact.title}</strong>
                                  <span>{artifact.summary}</span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}

                      {memoryHits.length ? (
                        <div className="message-memory-hits">
                          {memoryHits.map((hit) => (
                            <span key={hit.id} className="mini-tag">
                              {hit.title}
                            </span>
                          ))}
                        </div>
                      ) : null}

                      {nodes.length ? (
                        <div className="node-stack">
                          {nodes.map((node) => (
                            <div key={node.id} className={`thread-node node-${node.kind}`}>
                              <div className="node-header">
                                <div>
                                  <p className="node-kind">{node.kind}</p>
                                  <h3>{node.title}</h3>
                                </div>
                                <span className={`node-status status-${node.status}`}>{node.status}</span>
                              </div>
                              <p className="node-summary">{node.summary}</p>
                              {node.body ? (
                                <div className="node-body">
                                  <MarkdownRenderer content={node.body} />
                                </div>
                              ) : null}
                              {node.bullet_points.length ? (
                                <ul className="node-bullets">
                                  {node.bullet_points.map((bullet) => (
                                    <li key={bullet}>{bullet}</li>
                                  ))}
                                </ul>
                              ) : null}
                              <div className="node-actions">
                                {node.cta_label ? (
                                  <button className="button-secondary" onClick={() => handleNodeAction(node)}>
                                    {node.cta_label}
                                  </button>
                                ) : null}
                                {node.kind === "approval" && node.task_run_id ? (
                                  <>
                                    <button
                                      className="button-primary"
                                      onClick={() => void handleApproval(node.task_run_id!, "approve")}
                                    >
                                      Approve
                                    </button>
                                    <button
                                      className="button-secondary"
                                      onClick={() => void handleApproval(node.task_run_id!, "request_revision")}
                                    >
                                      Request revision
                                    </button>
                                    <button
                                      className="button-secondary"
                                      onClick={() => void handleApproval(node.task_run_id!, "reject")}
                                    >
                                      Reject
                                    </button>
                                  </>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <div className="composer-card">
                <label className="field-stack">
                  <span>Prompt</span>
                  <textarea
                    value={composerDraft}
                    onChange={(event) => setComposerDraft(event.target.value)}
                    placeholder="Ask AgentScope Chat to reason, call tools, launch apps, and save artifacts."
                  />
                </label>
                {uploadOpen ? (
                  <div className="upload-inline">
                    <input
                      value={uploadTitle}
                      onChange={(event) => setUploadTitle(event.target.value)}
                      placeholder="Optional upload title"
                    />
                    <input type="file" onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)} />
                    <button className="button-secondary" onClick={() => void handleUpload()} disabled={isUploading}>
                      {isUploading ? "Uploading…" : "Attach file"}
                    </button>
                  </div>
                ) : null}
                <div className="composer-controls">
                  <button className="button-secondary" onClick={() => setUploadOpen((current) => !current)}>
                    {uploadOpen ? "Hide upload" : "Add file"}
                  </button>
                  {latestActions.length ? (
                    <button className="button-secondary" onClick={() => setComposerDraft(latestActions[0])}>
                      Suggested follow-up
                    </button>
                  ) : null}
                  {selectedArtifact ? (
                    <button className="button-secondary" onClick={() => setPanel("artifact")}>
                      Open artifact
                    </button>
                  ) : null}
                  <button
                    className="button-primary"
                    onClick={() => void handleSendMessage(composerDraft)}
                    disabled={isSending}
                  >
                    {isSending ? "Working…" : "Send"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="memory-rail">
            <div className="memory-card inspector-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Runtime</p>
                  <h2>Live stack</h2>
                </div>
              </div>
              <div className="runtime-pill-row">
                <span className="mini-tag">AgentScope {data.integrations.agentscope_python_available ? "ready" : "missing"}</span>
                <span className="mini-tag">Provider {data.integrations.runtime_provider ?? "demo"}</span>
                <span className="mini-tag">ReMe {data.integrations.reme_available ? "detected" : "not found"}</span>
                <span className="mini-tag">MCP {data.integrations.mcp_server_count}</span>
              </div>
              <p className="panel-summary">{data.integrations.runtime_reason}</p>
              <div className="mini-list">
                {data.integrations.mcp_server_names.length ? (
                  data.integrations.mcp_server_names.map((serverName) => (
                    <div key={serverName} className="mini-record">
                      <strong>{serverName}</strong>
                      <span>MCP server available to chat runs</span>
                    </div>
                  ))
                ) : (
                  <div className="mini-record">
                    <strong>No MCP servers configured</strong>
                    <span>Open Settings to add connectors, or configure via server environment variables.</span>
                  </div>
                )}
              </div>
            </div>

            <div className="inspector-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Inspector</p>
                  <h2>Selected execution</h2>
                </div>
                {selectedExecution ? (
                  <span className={`node-status status-${selectedExecution.status}`}>{selectedExecution.status}</span>
                ) : null}
              </div>
              {selectedExecution ? (
                <>
                  <div className="panel-run-summary">
                    <strong>{selectedExecution.summary}</strong>
                    <p>{selectedExecution.prompt}</p>
                  </div>
                  <div className="detail-grid">
                    <div className="detail-card">
                      <span>Agent</span>
                      <strong>{selectedExecutionAgent?.name ?? selectedExecution.agent_id}</strong>
                    </div>
                    <div className="detail-card">
                      <span>Module</span>
                      <strong>{moduleLabel(selectedExecution.module)}</strong>
                    </div>
                    <div className="detail-card">
                      <span>Task</span>
                      <strong>{selectedExecutionTask?.title ?? "Thread run"}</strong>
                    </div>
                    <div className="detail-card">
                      <span>Started</span>
                      <strong>{formatTimestamp(selectedExecution.created_at)}</strong>
                    </div>
                  </div>
                  {selectedExecutionSkills.length ? (
                    <div className="tool-chip-row">
                      {selectedExecutionSkills.map((skillId) => (
                        <span key={skillId} className="tool-chip">
                          Skill: {displayName(skillId)}
                        </span>
                      ))}
                    </div>
                  ) : null}
                  {selectedExecutionArtifacts.length ? (
                    <div className="mini-list">
                      {selectedExecutionArtifacts.map((artifact) => (
                        <button
                          key={artifact.id}
                          className="mini-record mini-record-button"
                          onClick={() => {
                            setSelectedArtifactId(artifact.id);
                            setPanel("artifact");
                          }}
                        >
                          <strong>{artifact.title}</strong>
                          <span>{artifact.summary}</span>
                        </button>
                      ))}
                    </div>
                  ) : null}
                  <div className="mini-list">
                    {selectedExecution.tool_calls.map((toolCall) => (
                      <div key={toolCall.id} className="mini-record">
                        <div className="memory-title-row">
                          <strong>{displayName(toolCall.name)}</strong>
                          <span>{toolCall.status}</span>
                        </div>
                        <p>{toolCall.summary}</p>
                        <div className="tool-call-preview">
                          <p>{toolCall.input_preview}</p>
                          <MarkdownRenderer content={toolCall.output_preview} />
                        </div>
                        <div className="tool-chip-row">
                          <span className="tool-chip">{toolCall.skill_id ? `Skill ${displayName(toolCall.skill_id)}` : "Tool call"}</span>
                          {toolCall.app_id ? (
                            <button
                              className="tool-chip button-chip"
                              onClick={() => {
                                setSelectedAppId(toolCall.app_id!);
                                setPanel("app");
                              }}
                            >
                              Open app
                            </button>
                          ) : null}
                          {toolCall.artifact_id ? (
                            <button
                              className="tool-chip button-chip"
                              onClick={() => {
                                setSelectedArtifactId(toolCall.artifact_id!);
                                setPanel("artifact");
                              }}
                            >
                              Open artifact
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="mini-record">
                  <strong>No execution selected</strong>
                  <span>Run a prompt or open an app to see tool calls and outputs here.</span>
                </div>
              )}
            </div>

            <div className="inspector-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Capabilities</p>
                  <h2>What chat can use</h2>
                </div>
              </div>
              <div className="capability-columns">
                <div className="capability-section">
                  <h3>Agents</h3>
                  <div className="mini-list">
                    {data.agents.map((agent) => (
                      <div key={agent.id} className="mini-record">
                        <strong>{agent.name}</strong>
                        <span>{agent.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="capability-section">
                  <h3>Tools</h3>
                  <div className="mini-list">
                    {builtinTools.map((tool) => (
                      <div key={tool.id} className="mini-record">
                        <div className="toggle-row">
                          <strong>{displayName(tool.name)}</strong>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={tool.enabled}
                              onChange={(event) => void handleToggleTool(tool.name, event.target.checked)}
                            />
                            <span>{tool.enabled ? "On" : "Off"}</span>
                          </label>
                        </div>
                        <span>{tool.summary}</span>
                      </div>
                    ))}
                    {mcpTools.map((tool) => (
                      <div key={tool.id} className="mini-record">
                        <strong>{tool.name}</strong>
                        <span>{tool.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="capability-section">
                  <h3>Skills</h3>
                  <div className="mini-list">
                    {data.skills.map((skill) => (
                      <div key={skill.id} className="mini-record">
                        <div className="toggle-row">
                          <strong>{skill.name}</strong>
                          <label className="switch">
                            <input
                              type="checkbox"
                              checked={skill.enabled}
                              onChange={(event) => void handleToggleSkill(skill.id, event.target.checked)}
                            />
                            <span>{skill.enabled ? "On" : "Off"}</span>
                          </label>
                        </div>
                        <span>{skill.summary}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="capability-section">
                  <h3>Apps</h3>
                  <div className="mini-list">
                    {featuredApps.map((app) => (
                      <button
                        key={app.id}
                        className="mini-record mini-record-button"
                        onClick={() => {
                          setSelectedAppId(app.id);
                          setPanel("app");
                        }}
                      >
                        <strong>{app.title}</strong>
                        <span>{app.summary}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {memoryOpen ? (
              <div className="memory-card inspector-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Memory</p>
                    <h2>Persistent context</h2>
                  </div>
                </div>
                <div className="memory-list">
                  {sidecarItems.map((item) => (
                    <div key={item.id} className={`memory-item memory-${item.kind}`}>
                      <div className="memory-title-row">
                        <strong>{item.title}</strong>
                        {item.pinned ? <span className="mini-tag">Pinned</span> : null}
                      </div>
                      <p>{item.summary}</p>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>
      </main>

      {panel ? (
        <div className="workspace-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="workspace-panel" onClick={(event) => event.stopPropagation()}>
            {panel === "artifact" && selectedArtifact ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Artifact studio</p>
                    <h2>{selectedArtifact.title}</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="panel-summary">{selectedArtifact.summary}</p>
                <div className="context-ribbon">
                  <span className="hero-chip">{moduleLabel(selectedArtifact.module)}</span>
                  <span className="hero-chip">{selectedArtifact.kind}</span>
                  <span className="hero-chip">Updated {formatTimestamp(selectedArtifact.updated_at)}</span>
                </div>
                <textarea
                  className="panel-textarea"
                  value={artifactDraft}
                  onChange={(event) => setArtifactDraft(event.target.value)}
                />
                <div className="panel-actions">
                  <button className="button-primary" onClick={() => void handleSaveArtifact()} disabled={isSavingArtifact}>
                    {isSavingArtifact ? "Saving…" : "Save artifact"}
                  </button>
                  <button
                    className="button-secondary"
                    onClick={() => void handlePublishInvestorRoom()}
                    disabled={isPublishingRoom}
                  >
                    {isPublishingRoom ? "Publishing…" : "Publish to investor room"}
                  </button>
                </div>
              </>
            ) : null}

            {panel === "app" && selectedApp ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">App studio</p>
                    <h2>{selectedApp.title}</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="panel-summary">{selectedApp.summary}</p>
                <div className="context-ribbon">
                  <span className="hero-chip">{categoryLabel(selectedApp.category)}</span>
                  <span className="hero-chip">{selectedApp.status}</span>
                  <span className="hero-chip">Last run {formatTimestamp(selectedApp.last_run_at)}</span>
                </div>
                <label className="field-stack">
                  <span>Run prompt</span>
                  <textarea value={appPrompt} onChange={(event) => setAppPrompt(event.target.value)} />
                </label>
                <div className="mini-list">
                  {selectedApp.skill_ids.map((skillId) => (
                    <div key={skillId} className="mini-record">
                      <strong>{displayName(skillId)}</strong>
                      <span>Skill available inside this app flow</span>
                    </div>
                  ))}
                </div>
                {selectedExecution ? (
                  <div className="panel-run-summary">
                    <strong>{selectedExecution.summary}</strong>
                    <p>{selectedExecution.prompt}</p>
                  </div>
                ) : null}
                <div className="panel-actions">
                  <button className="button-primary" onClick={() => void handleLaunchApp()} disabled={isLaunchingApp}>
                    {isLaunchingApp ? "Launching…" : "Run app"}
                  </button>
                  {selectedArtifact ? (
                    <button className="button-secondary" onClick={() => setPanel("artifact")}>
                      Open latest artifact
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {panel === "workspace" ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Workspace</p>
                    <h2>Context, runtime, and demo defaults</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <div className="detail-grid">
                  <div className="detail-card">
                    <span>Ready apps</span>
                    <strong>{readyApps.length}</strong>
                  </div>
                  <div className="detail-card">
                    <span>Skills</span>
                    <strong>{data.skills.length}</strong>
                  </div>
                  <div className="detail-card">
                    <span>Tools</span>
                    <strong>{data.tool_catalog.length}</strong>
                  </div>
                  <div className="detail-card">
                    <span>MCP servers</span>
                    <strong>{data.integrations.mcp_server_count}</strong>
                  </div>
                </div>
                <div className="inspector-card">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">MCP connectors</p>
                      <h2>Connect external services</h2>
                    </div>
                  </div>
                  <div className="grid-two">
                    <label className="field-stack">
                      <span>Name</span>
                      <input
                        value={connectorForm.name}
                        onChange={(event) => setConnectorForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="Notion, Linear, Slack, Google Drive"
                      />
                    </label>
                    <label className="field-stack">
                      <span>Transport</span>
                      <select
                        value={connectorForm.transport}
                        onChange={(event) => setConnectorForm((current) => ({ ...current, transport: event.target.value }))}
                      >
                        <option value="sse">sse</option>
                        <option value="stdio">stdio</option>
                      </select>
                    </label>
                  </div>
                  <div className="grid-two">
                    <label className="field-stack">
                      <span>URL (for sse)</span>
                      <input
                        value={connectorForm.url}
                        onChange={(event) => setConnectorForm((current) => ({ ...current, url: event.target.value }))}
                        placeholder="https://example.com/mcp"
                      />
                    </label>
                    <label className="field-stack">
                      <span>Command (for stdio)</span>
                      <input
                        value={connectorForm.command}
                        onChange={(event) => setConnectorForm((current) => ({ ...current, command: event.target.value }))}
                        placeholder="npx -y @modelcontextprotocol/server-github"
                      />
                    </label>
                  </div>
                  <div className="panel-actions">
                    <button className="button-primary" onClick={() => void handleAddConnector()}>
                      Add connector
                    </button>
                  </div>
                  <div className="mini-list">
                    {mcpConnectors.length ? (
                      mcpConnectors.map((connector) => (
                        <div key={connector.id} className="mini-record">
                          <div className="toggle-row">
                            <strong>{connector.name}</strong>
                            <label className="switch">
                              <input
                                type="checkbox"
                                checked={connector.enabled}
                                onChange={(event) => void handleToggleConnector(connector, event.target.checked)}
                              />
                              <span>{connector.enabled ? "On" : "Off"}</span>
                            </label>
                          </div>
                          <span>{connector.transport === "sse" ? connector.url : connector.command}</span>
                        </div>
                      ))
                    ) : (
                      <div className="mini-record">
                        <strong>No connectors configured</strong>
                        <span>Add an MCP connector here to make it available to chat runs.</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="grid-two">
                  <label className="field-stack">
                    <span>Company</span>
                    <input
                      value={workspaceForm.company_name}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, company_name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Founder</span>
                    <input
                      value={workspaceForm.founder_name}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, founder_name: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="grid-two">
                  <label className="field-stack">
                    <span>Stage</span>
                    <input
                      value={workspaceForm.stage}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, stage: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field-stack">
                    <span>Primary KPI</span>
                    <input
                      value={workspaceForm.primary_kpi}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, primary_kpi: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <label className="field-stack">
                  <span>Mission</span>
                  <textarea
                    value={workspaceForm.mission}
                    onChange={(event) => setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))}
                  />
                </label>
                <label className="field-stack">
                  <span>Operating summary</span>
                  <textarea
                    value={workspaceForm.summary}
                    onChange={(event) => setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))}
                  />
                </label>
                <div className="panel-actions">
                  <button
                    className="button-primary"
                    onClick={() => void completeOnboarding()}
                    disabled={isUpdatingWorkspace}
                  >
                    {isUpdatingWorkspace ? "Saving…" : "Save workspace context"}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
