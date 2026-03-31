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
import type {
  AppCategory,
  Artifact,
  AuthSession,
  BootstrapResponse,
  MemoryItem,
  ModuleKey,
  ThreadNode,
  UploadRecord,
  WorkspaceApp,
} from "./types";

type PanelState = "artifact" | "app" | "workspace" | null;

const focusOptions: Array<{ key: ModuleKey; label: string }> = [
  { key: "inbox", label: "General" },
  { key: "strategy", label: "Strategy" },
  { key: "execution", label: "Execution" },
  { key: "capital", label: "Capital" },
  { key: "apps", label: "Apps" },
];

const starterPrompts = [
  "Turn the founder vision into the next 90-day operating plan.",
  "Summarize what is blocked and what needs my decision right now.",
  "Prepare an investor update from the latest workspace activity.",
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

function buildBranchTitle(module: ModuleKey) {
  switch (module) {
    case "strategy":
      return "Strategy branch";
    case "execution":
      return "Execution branch";
    case "capital":
      return "Capital branch";
    case "apps":
      return "App branch";
    case "artifacts":
      return "Artifact branch";
    default:
      return "Current thread";
  }
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
  const [focusModule, setFocusModule] = useState<ModuleKey>("inbox");
  const [composerDraft, setComposerDraft] = useState("");
  const [appPrompt, setAppPrompt] = useState("");
  const [artifactDraft, setArtifactDraft] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");

  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("current-thread");

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

  const [threadNodes, setThreadNodes] = useState<Record<string, ThreadNode[]>>({});
  const [threadMemory, setThreadMemory] = useState<Record<string, MemoryItem[]>>({});
  const [threadActions, setThreadActions] = useState<Record<string, string[]>>({});

  const loadWorkspace = async (options?: { artifactId?: string; appId?: string }) => {
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
  const latestNodes = latestAssistantMessage ? threadNodes[latestAssistantMessage.id] ?? [] : [];
  const latestMemoryHits = latestAssistantMessage ? threadMemory[latestAssistantMessage.id] ?? [] : [];
  const latestActions = latestAssistantMessage ? threadActions[latestAssistantMessage.id] ?? [] : [];

  const selectedArtifact =
    data?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? data?.artifacts[0] ?? null;
  const selectedApp =
    data?.apps.find((app) => app.id === selectedAppId) ?? data?.apps.find((app) => app.featured) ?? data?.apps[0] ?? null;
  const selectedAppRun =
    data?.task_runs.find(
      (task) =>
        task.module === "apps" &&
        selectedApp &&
        task.title.toLowerCase().includes(selectedApp.title.toLowerCase()),
    ) ?? null;

  const branchItems = useMemo(() => {
    if (!data) {
      return [];
    }
    const items = [
      {
        id: "current-thread",
        title: "Current thread",
        subtitle: "The active founder conversation.",
        module: focusModule,
      },
      ...data.task_runs.slice(0, 4).map((task) => ({
        id: task.id,
        title: task.title,
        subtitle: task.trace_summary,
        module: task.module,
      })),
    ];
    return items;
  }, [data, focusModule]);

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

      setThreadNodes((current) => ({ ...current, [response.reply.id]: response.nodes }));
      setThreadMemory((current) => ({ ...current, [response.reply.id]: response.memory_hits }));
      setThreadActions((current) => ({ ...current, [response.reply.id]: response.next_actions }));
      setComposerDraft("");
      setSelectedArtifactId(response.artifact.id);
      if (response.launched_app_id) {
        setSelectedAppId(response.launched_app_id);
      }
      await loadWorkspace({
        artifactId: response.artifact.id,
        appId: response.launched_app_id ?? undefined,
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
    if (node.task_run_id && node.kind === "approval") {
      setPanel("workspace");
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
    <div className="thread-app-shell">
      <aside className="thread-sidebar">
        <div className="sidebar-section">
          <p className="eyebrow">VXV Workspace</p>
          <h2>{data.workspace.company_name}</h2>
          <p className="sidebar-copy">
            Founder operating system with one persistent thread and one permanent memory layer.
          </p>
        </div>

        <div className="sidebar-section">
          <div className="sidebar-heading-row">
            <h3>Branches</h3>
            <span className="sidebar-meta">{buildBranchTitle(focusModule)}</span>
          </div>
          <div className="branch-list">
            {branchItems.map((branch) => (
              <button
                key={branch.id}
                className={`branch-chip ${selectedBranchId === branch.id ? "active" : ""}`}
                onClick={() => {
                  setSelectedBranchId(branch.id);
                  setFocusModule(branch.module);
                }}
              >
                <strong>{branch.title}</strong>
                <span>{branch.subtitle}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section sidebar-actions">
          <button className="button-secondary" onClick={() => setPanel("workspace")}>
            Workspace settings
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
      </aside>

      <main className="thread-main">
        <header className="thread-header">
          <div>
            <p className="eyebrow">Command workspace</p>
            <h1>Ask once. Let the workspace gather context, invoke the right workflow, and keep the work connected.</h1>
          </div>
          <div className="thread-status">
            <span className="status-pill">Session active</span>
            <span className="status-pill">{data.integrations.mode}</span>
            <span className="status-pill">{data.workspace.primary_kpi}</span>
          </div>
        </header>

        {notice ? <p className="status-notice">{notice}</p> : null}
        {error ? <p className="status-error">{error}</p> : null}

        <div className="thread-layout">
          <section className="thread-center">
            <div className="thread-intro-card">
              <div>
                <p className="eyebrow">Founder command loop</p>
                <h2>Chat is temporal. Memory is permanent. Apps appear only when the thread needs deeper work.</h2>
                <p className="lede">
                  The thread is the default working surface. Artifacts, approvals, investor work,
                  and apps should appear only when they help the current conversation move forward.
                </p>
              </div>
              <div className="metric-strip">
                <div>
                  <span>Goals</span>
                  <strong>{data.metrics.active_goals}</strong>
                </div>
                <div>
                  <span>Runs</span>
                  <strong>{data.metrics.running_tasks}</strong>
                </div>
                <div>
                  <span>Artifacts</span>
                  <strong>{data.metrics.ready_artifacts}</strong>
                </div>
                <div>
                  <span>Investors</span>
                  <strong>{data.metrics.warm_investors}</strong>
                </div>
              </div>
            </div>

            <div className="thread-focus-row">
              {focusOptions.map((option) => (
                <button
                  key={option.key}
                  className={`focus-pill ${focusModule === option.key ? "active" : ""}`}
                  onClick={() => setFocusModule(option.key)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="thread-card">
              <div className="thread-stream">
                {messages.map((message) => {
                  const nodes = threadNodes[message.id] ?? [];
                  const memoryHits = threadMemory[message.id] ?? [];
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

              <div className="thread-suggestions">
                {starterPrompts.map((prompt) => (
                  <button key={prompt} className="suggestion-chip" onClick={() => setComposerDraft(prompt)}>
                    {prompt}
                  </button>
                ))}
              </div>

              <div className="composer-card">
                <textarea
                  value={composerDraft}
                  onChange={(event) => setComposerDraft(event.target.value)}
                  placeholder="Ask the workspace to plan, research, coordinate, generate, or act."
                />
                <div className="composer-controls">
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
                      {isUploading ? "Uploading…" : "Add to memory"}
                    </button>
                  </div>
                  <button
                    className="button-primary"
                    onClick={() => void handleSendMessage(composerDraft)}
                    disabled={isSending}
                  >
                    {isSending ? "Working…" : "Send to workspace"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <aside className="memory-rail">
            <div className="memory-card">
              <div className="memory-card-header">
                <div>
                  <p className="eyebrow">Memory</p>
                  <h2>Permanent context</h2>
                </div>
                <button className="button-secondary" onClick={() => setPanel("workspace")}>
                  Edit
                </button>
              </div>
              <div className="memory-list">
                {sidecarItems.map((item) => (
                  <div key={item.id} className={`memory-item memory-${item.kind}`}>
                    <div className="memory-title-row">
                      <strong>{item.title}</strong>
                      {item.pinned ? <span className="mini-tag">Pinned</span> : null}
                    </div>
                    <p>{item.summary}</p>
                    <span>{formatTimestamp(item.updated_at)}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="memory-card">
              <p className="eyebrow">Next actions</p>
              <div className="mini-list">
                {(latestActions.length ? latestActions : starterPrompts).map((action) => (
                  <button key={action} className="mini-list-item" onClick={() => setComposerDraft(action)}>
                    {action}
                  </button>
                ))}
              </div>
            </div>

            <div className="memory-card">
              <p className="eyebrow">Latest uploads</p>
              <div className="mini-list">
                {uploads.slice(0, 4).map((upload) => (
                  <div key={upload.id} className="mini-record">
                    <strong>{upload.filename}</strong>
                    <span>{formatTimestamp(upload.created_at)}</span>
                  </div>
                ))}
              </div>
            </div>
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
                {selectedAppRun ? (
                  <div className="panel-run-summary">
                    <strong>{selectedAppRun.title}</strong>
                    <p>{selectedAppRun.trace_summary}</p>
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
