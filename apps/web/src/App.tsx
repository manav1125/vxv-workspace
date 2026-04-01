import { useEffect, useMemo, useState } from "react";

import { MarkdownRenderer } from "./components/MarkdownRenderer";
import {
  clearAuthToken,
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
  updateWorkspace,
  uploadDocument,
} from "./lib/api";
import type { AppCategory, AuthSession, BootstrapResponse, MemoryItem, ModuleKey, ThreadNode, UploadRecord } from "./types";

type PanelState = "artifact" | "app" | "workspace" | null;

const focusOptions: Array<{ key: ModuleKey; label: string }> = [
  { key: "inbox", label: "General" },
  { key: "strategy", label: "Strategy" },
  { key: "execution", label: "Execution" },
  { key: "capital", label: "Capital" },
  { key: "apps", label: "Apps" },
];

const onboardingPrompts = [
  "Weekly Founder Review",
  "Customer Research Sprint",
  "Investor Update Generator",
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

  const loadWorkspace = async (options?: { artifactId?: string; appId?: string; executionId?: string }) => {
    const [bootstrap, latestUploads] = await Promise.all([fetchBootstrap(), fetchUploads()]);
    setData(bootstrap);
    setUploads(latestUploads);

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
      bootstrap.apps[0];
    if (nextApp) {
      setSelectedAppId(nextApp.id);
      setAppPrompt((current) => current || `Run ${nextApp.title.toLowerCase()} on the latest workspace context.`);
    }

    const nextExecution =
      bootstrap.thread_executions.find((execution) => execution.id === options?.executionId) ??
      bootstrap.thread_executions.find((execution) => execution.app_id === options?.appId) ??
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
      } catch (loadError) {
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
    const onboardingKey = `vxv-chat-onboarding:${session.workspace_id}`;
    setShowOnboarding(window.localStorage.getItem(onboardingKey) !== "true");
  }, [session]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setNotice(null), 2600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  const messages = data?.messages ?? [];
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") ?? null;
  const latestMemoryHits = latestAssistantMessage?.memory_hits ?? [];
  const latestActions = latestAssistantMessage?.next_actions ?? [];

  const selectedArtifact =
    data?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? data?.artifacts[0] ?? null;
  const selectedApp =
    data?.apps.find((app) => app.id === selectedAppId) ?? data?.apps.find((app) => app.featured) ?? data?.apps[0] ?? null;
  const selectedExecution =
    data?.thread_executions.find((execution) => execution.id === selectedExecutionId) ??
    (selectedApp ? data?.thread_executions.find((execution) => execution.app_id === selectedApp.id) : null) ??
    data?.thread_executions[0] ??
    null;

  const sidecarItems = useMemo(() => {
    const seen = new Set<string>();
    const items = [...latestMemoryHits, ...(data?.memory_items ?? [])].filter((item) => {
      if (seen.has(item.id)) {
        return false;
      }
      seen.add(item.id);
      return true;
    });
    return items;
  }, [data, latestMemoryHits]);

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
      await loadWorkspace();
      if (session) {
        window.localStorage.setItem(`vxv-chat-onboarding:${session.workspace_id}`, "true");
      }
      setShowOnboarding(false);
      setNotice("Workspace set. Start from the thread.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update workspace");
    } finally {
      setIsUpdatingWorkspace(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!message.trim()) {
      return;
    }

    try {
      setIsSending(true);
      setError(null);
      const response = await sendFounderMessage({
        module: focusModule,
        message: message.trim(),
        selected_artifact_id: selectedArtifactId || undefined,
      });

      setComposerDraft("");
      setSelectedArtifactId(response.artifact.id);
      if (response.launched_app_id) {
        setSelectedAppId(response.launched_app_id);
      }
      await loadWorkspace({
        artifactId: response.artifact.id,
        appId: response.launched_app_id ?? undefined,
        executionId: response.thread_execution?.id ?? undefined,
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
      await loadWorkspace({ artifactId: response.artifact.id });
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
      await loadWorkspace({ artifactId: selectedArtifact.id });
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
      if (response.task_run.id) {
        setSelectedExecutionId((data?.thread_executions.find((execution) => execution.task_run_id === response.task_run.id)?.id) ?? "");
      }
      setPanel("app");
      setNotice(response.message);
      await loadWorkspace({
        artifactId: response.artifact?.id ?? selectedArtifactId,
        appId: selectedApp.id,
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
      await loadWorkspace({ artifactId: selectedArtifactId, appId: selectedAppId });
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
      await loadWorkspace({ artifactId: selectedArtifact.id });
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Unable to publish the investor room",
      );
    } finally {
      setIsPublishingRoom(false);
    }
  };

  const handleNodeAction = (node: ThreadNode) => {
    const linkedExecution = node.thread_execution_id
      ? data?.thread_executions.find((execution) => execution.id === node.thread_execution_id) ?? null
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

  if (isLoading) {
    return <div className="app-state">Loading VXV Workspace…</div>;
  }

  if (!session || !data) {
    return (
      <div className="login-screen">
        <div className="login-card-simple">
          <p className="eyebrow">VXV Workspace</p>
          <h1>One founder thread. One memory system. One operating layer.</h1>
          <p className="lede">
            Start from conversation. The workspace should gather context, invoke the right app or
            agent, and keep the work connected.
          </p>
          <label className="field-stack">
            <span>Email</span>
            <input
              value={loginForm.email}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, email: event.target.value }))
              }
            />
          </label>
          <label className="field-stack">
            <span>Password</span>
            <input
              type="password"
              value={loginForm.password}
              onChange={(event) =>
                setLoginForm((current) => ({ ...current, password: event.target.value }))
              }
            />
          </label>
          {error ? <p className="status-error">{error}</p> : null}
          <button className="button-primary" onClick={() => void handleLogin()} disabled={isAuthenticating}>
            {isAuthenticating ? "Entering workspace…" : "Enter workspace"}
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
            <p className="eyebrow">Set up your workspace</p>
            <h1>Make the thread useful before you start chatting.</h1>
            <p className="lede">
              The chat should feel like a co-founder with memory, not a blank assistant. Give it
              your company context, your operating focus, and the first workflows you want it to
              handle.
            </p>
            <div className="onboarding-prompts">
              {onboardingPrompts.map((prompt) => (
                <span key={prompt} className="mini-tag">
                  {prompt}
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
                onChange={(event) =>
                  setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))
                }
              />
            </label>
            <label className="field-stack">
              <span>Operating summary</span>
              <textarea
                value={workspaceForm.summary}
                onChange={(event) =>
                  setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))
                }
              />
            </label>
            {error ? <p className="status-error">{error}</p> : null}
            <button
              className="button-primary"
              onClick={() => void completeOnboarding()}
              disabled={isUpdatingWorkspace}
            >
              {isUpdatingWorkspace ? "Saving…" : "Enter command workspace"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-app-shell">
      <main className="chat-main">
        <header className="chat-header">
          <div className="chat-header-copy">
            <span className="workspace-label">{data.workspace.company_name}</span>
            <h1>VXV Workspace</h1>
          </div>
          <div className="chat-header-controls">
            <label className="lens-select">
              <span>Lens</span>
              <select value={focusModule} onChange={(event) => setFocusModule(event.target.value as ModuleKey)}>
                {focusOptions.map((option) => (
                  <option key={option.key} value={option.key}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <button className="button-secondary" onClick={() => setMemoryOpen((current) => !current)}>
              {memoryOpen ? "Hide memory" : "Show memory"}
            </button>
            <button className="button-secondary" onClick={() => setPanel("workspace")}>
              Settings
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
        </header>

        {notice ? <p className="status-notice">{notice}</p> : null}
        {error ? <p className="status-error">{error}</p> : null}

        <div className={`chat-layout ${memoryOpen ? "with-memory" : "without-memory"}`}>
          <section className="chat-column">
            <div className="chat-surface">
              <div className="thread-stream">
                {messages.map((message) => {
                  const nodes = message.nodes ?? [];
                  const memoryHits = message.memory_hits ?? [];
                  return (
                    <article
                      key={message.id}
                      className={`thread-message ${message.role === "user" ? "is-user" : "is-assistant"}`}
                    >
                      <div className="message-header">
                        <strong>{message.author}</strong>
                        <span>{formatTimestamp(message.created_at)}</span>
                      </div>
                      <MarkdownRenderer content={message.content} />

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

              <div className="composer-card composer-minimal">
                <textarea
                  value={composerDraft}
                  onChange={(event) => setComposerDraft(event.target.value)}
                  placeholder="Ask the workspace anything."
                />
                {uploadOpen ? (
                  <div className="upload-inline">
                    <input
                      value={uploadTitle}
                      onChange={(event) => setUploadTitle(event.target.value)}
                      placeholder="Optional upload title"
                    />
                    <input
                      type="file"
                      onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    />
                    <button className="button-secondary" onClick={() => void handleUpload()} disabled={isUploading}>
                      {isUploading ? "Uploading…" : "Add file"}
                    </button>
                  </div>
                ) : null}
                <div className="composer-controls composer-controls-minimal">
                  <button className="button-secondary" onClick={() => setUploadOpen((current) => !current)}>
                    {uploadOpen ? "Hide upload" : "Add file"}
                  </button>
                  {latestActions.length ? (
                    <button className="button-secondary" onClick={() => setComposerDraft(latestActions[0])}>
                      Suggested follow-up
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

          {memoryOpen ? (
            <aside className="memory-rail memory-rail-minimal">
              <div className="memory-card">
                <div className="memory-card-header">
                  <div>
                    <p className="eyebrow">Memory</p>
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
            </aside>
          ) : null}
        </div>
      </main>

      {panel ? (
        <div className="workspace-panel-backdrop" onClick={() => setPanel(null)}>
          <div className="workspace-panel" onClick={(event) => event.stopPropagation()}>
            {panel === "artifact" && selectedArtifact ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Artifact workspace</p>
                    <h2>{selectedArtifact.title}</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="panel-summary">{selectedArtifact.summary}</p>
                <textarea
                  className="panel-textarea"
                  value={artifactDraft}
                  onChange={(event) => setArtifactDraft(event.target.value)}
                />
                <div className="panel-actions">
                  <button className="button-primary" onClick={() => void handleSaveArtifact()} disabled={isSavingArtifact}>
                    {isSavingArtifact ? "Saving…" : "Save to artifacts"}
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
                    <p className="eyebrow">Mini-app workspace</p>
                    <h2>{selectedApp.title}</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
                </div>
                <p className="panel-summary">{selectedApp.summary}</p>
                <div className="mini-tag-row">
                  <span className="mini-tag">{categoryLabel(selectedApp.category)}</span>
                  <span className="mini-tag">{selectedApp.status}</span>
                </div>
                <label className="field-stack">
                  <span>Run prompt</span>
                  <textarea value={appPrompt} onChange={(event) => setAppPrompt(event.target.value)} />
                </label>
                <div className="mini-list">
                  {selectedApp.skill_ids.map((skillId) => (
                    <div key={skillId} className="mini-record">
                      <strong>{skillId.replace("skill-", "").replaceAll("-", " ")}</strong>
                      <span>Skill invoked inside the run</span>
                    </div>
                  ))}
                </div>
                {selectedExecution ? (
                  <>
                    <div className="panel-run-summary">
                      <strong>{selectedExecution.summary}</strong>
                      <p>{selectedExecution.prompt}</p>
                    </div>
                    {selectedExecution.output_artifact_ids.length ? (
                      <div className="mini-list">
                        {selectedExecution.output_artifact_ids.map((artifactId) => {
                          const artifact = data?.artifacts.find((item) => item.id === artifactId);
                          if (!artifact) {
                            return null;
                          }
                          return (
                            <button
                              key={artifactId}
                              className="mini-record mini-record-button"
                              onClick={() => {
                                setSelectedArtifactId(artifactId);
                                setPanel("artifact");
                              }}
                            >
                              <strong>{artifact.title}</strong>
                              <span>{artifact.summary}</span>
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                    <div className="mini-list">
                      {selectedExecution.tool_calls.map((toolCall) => (
                        <div key={toolCall.id} className="mini-record">
                          <strong>{toolCall.name.replaceAll("_", " ")}</strong>
                          <span>{toolCall.summary}</span>
                          <div className="tool-call-preview">
                            <p>{toolCall.input_preview}</p>
                            <MarkdownRenderer content={toolCall.output_preview} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </>
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
                    <p className="eyebrow">Workspace settings</p>
                    <h2>Persistent context and operating defaults</h2>
                  </div>
                  <button className="button-secondary" onClick={() => setPanel(null)}>
                    Close
                  </button>
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
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))
                    }
                  />
                </label>
                <label className="field-stack">
                  <span>Operating summary</span>
                  <textarea
                    value={workspaceForm.summary}
                    onChange={(event) =>
                      setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))
                    }
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
