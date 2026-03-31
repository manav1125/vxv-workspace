import { useEffect, useMemo, useState } from "react";

import { MarkdownRenderer } from "./components/MarkdownRenderer";
import {
  clearAuthToken,
  createContact,
  createFundraiseInvestor,
  createGoal,
  createKnowledgeSource,
  createUser,
  decideApproval,
  fetchBootstrap,
  fetchSession,
  fetchUploads,
  fetchUsers,
  launchApp,
  launchWorkflow,
  login,
  publishInvestorRoom,
  saveArtifact,
  sendFounderMessage,
  setAuthToken,
  updateAgent,
  updateFundraiseInvestor,
  updateGoal,
  updateUser,
  updateWorkspace,
  uploadDocument,
} from "./lib/api";
import type {
  AppCategory,
  Artifact,
  AuthSession,
  BootstrapResponse,
  ModuleKey,
  SkillDefinition,
  UploadRecord,
  WorkspaceApp,
  WorkspaceUser,
} from "./types";

type SurfaceKey = "command" | "artifacts" | "apps" | "capital" | "workspace";
type WorkspacePanel = "setup" | "team" | "knowledge";
type CapitalSurface = "workspace" | "investor-room";
type AppSurface = "library" | "run";

const surfaceOrder: SurfaceKey[] = ["command", "artifacts", "apps", "capital", "workspace"];

const surfaceMeta: Record<SurfaceKey, { label: string; kicker: string }> = {
  command: { label: "Command", kicker: "Primary" },
  artifacts: { label: "Artifacts", kicker: "Workbench" },
  apps: { label: "Apps", kicker: "Workbench" },
  capital: { label: "Capital", kicker: "Workbench" },
  workspace: { label: "Workspace", kicker: "Workbench" },
};

const moduleMeta: Record<ModuleKey, { label: string; description: string }> = {
  inbox: {
    label: "General",
    description: "Cross-workspace asks, routing, and founder steering.",
  },
  strategy: {
    label: "Strategy",
    description: "Planning, research, GTM, and narrative work.",
  },
  team: {
    label: "Team",
    description: "AI teammates, budgets, permissions, and escalations.",
  },
  execution: {
    label: "Execution",
    description: "Cadences, workflows, blockers, and follow-through.",
  },
  artifacts: {
    label: "Artifacts",
    description: "Plans, briefs, memos, updates, and durable outputs.",
  },
  capital: {
    label: "Capital",
    description: "Fundraising, investor updates, and diligence readiness.",
  },
  apps: {
    label: "Apps",
    description: "Use a richer workflow surface when chat alone is not enough.",
  },
};

const commandFocusModules: ModuleKey[] = ["inbox", "strategy", "execution", "capital", "apps"];

const appCategories: Array<"all" | AppCategory> = [
  "all",
  "strategy",
  "growth",
  "operations",
  "fundraising",
  "hiring",
  "research",
];

const defaultSuggestions: Record<ModuleKey, string[]> = {
  inbox: [
    "What should I focus on this week across the workspace?",
    "Summarize anything blocked or waiting for me.",
    "Turn the latest progress into the next best operating plan.",
  ],
  strategy: [
    "Turn the current vision into a 90-day operating plan.",
    "Clarify our wedge, customer, and GTM priorities.",
    "Draft a customer research sprint for this week.",
  ],
  team: [
    "Design the first AI team for this company.",
    "Which tasks should stay human-in-the-loop?",
    "Propose budgets and escalation rules for each agent.",
  ],
  execution: [
    "Set up a weekly founder review cadence.",
    "Turn the latest plan into workflows and owners.",
    "Show me the biggest blockers across current runs.",
  ],
  artifacts: [
    "Draft a founder brief from the latest decisions.",
    "Create an investor update from current workspace progress.",
    "Convert this thread into a board-ready memo.",
  ],
  capital: [
    "Tighten the round narrative and investor memo.",
    "Build a diligence checklist from current artifacts.",
    "Prioritize the next investors to approach.",
  ],
  apps: [
    "Launch the pitch deck reviewer on the latest deck.",
    "What app should I use to generate an investor update?",
    "Start a customer research synthesis from recent uploads.",
  ],
};

const founderLaunchCards = [
  {
    title: "Define your first goal",
    body: "Set the objective and KPI that should shape the next cycle of work.",
    action: "Set objective",
    module: "strategy" as ModuleKey,
    prompt:
      "Turn our founder vision into one primary strategic goal and KPI for the next 90 days.",
  },
  {
    title: "Launch your first AI teammate",
    body: "Set up the first specialist agents and the rules they should follow.",
    action: "Design team",
    module: "team" as ModuleKey,
    prompt:
      "Design the first AI agent team for this company with roles, budgets, and escalation rules.",
  },
  {
    title: "Connect company knowledge",
    body: "Ingest docs and notes so the workspace can ground its work.",
    action: "Connect context",
    module: "artifacts" as ModuleKey,
    prompt: "Create the first workspace artifact and knowledge ingestion plan.",
  },
  {
    title: "Start a weekly founder review",
    body: "Build a cadence for progress, decisions, blockers, and next actions.",
    action: "Set cadence",
    module: "execution" as ModuleKey,
    prompt:
      "Set up a weekly founder review cadence with KPIs, blockers, decisions, and delegated follow-up.",
  },
];

function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "No recent activity";
  }

  return new Date(value).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function categoryLabel(category: AppCategory): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

function App() {
  const [data, setData] = useState<BootstrapResponse | null>(null);
  const [users, setUsers] = useState<WorkspaceUser[]>([]);
  const [uploads, setUploads] = useState<UploadRecord[]>([]);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);

  const [activeSurface, setActiveSurface] = useState<SurfaceKey>("command");
  const [commandModule, setCommandModule] = useState<ModuleKey>("inbox");
  const [workspacePanel, setWorkspacePanel] = useState<WorkspacePanel>("setup");
  const [capitalSurface, setCapitalSurface] = useState<CapitalSurface>("workspace");
  const [appSurface, setAppSurface] = useState<AppSurface>("library");

  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [selectedAgentId, setSelectedAgentId] = useState("");

  const [artifactDraft, setArtifactDraft] = useState("");
  const [artifactView, setArtifactView] = useState<"preview" | "edit">("preview");
  const [composerDraft, setComposerDraft] = useState("");
  const [workflowNote, setWorkflowNote] = useState("");

  const [showOnboarding, setShowOnboarding] = useState(false);
  const [commandContext, setCommandContext] = useState<{
    routedModule: ModuleKey;
    contextItems: string[];
    nextActions: string[];
    launchedAppId?: string | null;
  } | null>(null);

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
  const [goalForm, setGoalForm] = useState({
    title: "",
    owner: "ChiefOfStaffAgent",
    kpi: "",
    due_date: "2026-06-30",
    linked_agents: [] as string[],
    status: "Planned",
  });
  const [knowledgeForm, setKnowledgeForm] = useState({
    title: "",
    source_type: "doc",
    status: "Connected",
    freshness: "Today",
  });
  const [agentForm, setAgentForm] = useState({
    budget: "",
    permissions: "",
    escalation_rule: "",
  });
  const [investorForm, setInvestorForm] = useState({
    name: "",
    thesis: "",
    stage_fit: "Seed",
    relationship_status: "New",
    next_step: "",
  });
  const [contactForm, setContactForm] = useState({
    name: "",
    category: "Advisor",
    company: "",
    relationship_stage: "New",
    last_touch: "",
  });
  const [userForm, setUserForm] = useState({
    email: "",
    password: "",
    display_name: "",
    role: "member",
  });
  const [investorDrafts, setInvestorDrafts] = useState<
    Record<string, { relationship_status: string; next_step: string }>
  >({});
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { display_name: string; role: string; status: string }>
  >({});
  const [appCategoryFilter, setAppCategoryFilter] = useState<"all" | AppCategory>("all");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [isLaunchingApp, setIsLaunchingApp] = useState(false);
  const [isSubmittingPanel, setIsSubmittingPanel] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPublishingRoom, setIsPublishingRoom] = useState(false);
  const [isDecidingApproval, setIsDecidingApproval] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const session = await fetchSession();
        setAuthSession(session);

        const [bootstrap, workspaceUsers, workspaceUploads] = await Promise.all([
          fetchBootstrap(),
          fetchUsers(),
          fetchUploads(),
        ]);

        setData(bootstrap);
        setUsers(workspaceUsers);
        setUploads(workspaceUploads);
      } catch (loadError) {
        clearAuthToken();
        setAuthSession(null);
        setData(null);
        if (loadError instanceof Error && !loadError.message.includes("401")) {
          setError(loadError.message);
        }
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  useEffect(() => {
    if (!authSession) {
      setShowOnboarding(false);
      return;
    }
    const key = `vxv-onboarding-complete:${authSession.workspace_id}`;
    setShowOnboarding(window.localStorage.getItem(key) !== "true");
  }, [authSession]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setWorkspaceForm({
      company_name: data.workspace.company_name,
      founder_name: data.workspace.founder_name,
      stage: data.workspace.stage,
      mission: data.workspace.mission,
      primary_kpi: data.workspace.primary_kpi,
      summary: data.workspace.summary,
    });

    setInvestorDrafts(
      Object.fromEntries(
        data.fundraise_pipeline.investors.map((investor) => [
          investor.id,
          {
            relationship_status: investor.relationship_status,
            next_step: investor.next_step,
          },
        ]),
      ),
    );

    const initialArtifact =
      data.artifacts.find((artifact) => artifact.module === "strategy") ?? data.artifacts[0];
    if (initialArtifact) {
      setSelectedArtifactId((current) => current || initialArtifact.id);
      setArtifactDraft((current) => current || initialArtifact.content);
    }

    const initialApp = data.apps.find((app) => app.featured) ?? data.apps[0];
    if (initialApp) {
      setSelectedAppId((current) => current || initialApp.id);
    }

    const initialAgent = data.agents[0];
    if (initialAgent) {
      setSelectedAgentId((current) => current || initialAgent.id);
    }
  }, [data]);

  useEffect(() => {
    setUserDrafts(
      Object.fromEntries(
        users.map((user) => [
          user.email,
          {
            display_name: user.display_name,
            role: user.role,
            status: user.status,
          },
        ]),
      ),
    );
  }, [users]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const selected = data.agents.find((agent) => agent.id === selectedAgentId) ?? data.agents[0];
    if (!selected) {
      return;
    }
    setAgentForm({
      budget: selected.budget,
      permissions: selected.permissions.join(", "),
      escalation_rule: selected.escalation_rule,
    });
  }, [data, selectedAgentId]);

  useEffect(() => {
    if (!data) {
      return;
    }
    const selected = data.artifacts.find((artifact) => artifact.id === selectedArtifactId);
    if (selected) {
      setArtifactDraft(selected.content);
    }
  }, [data, selectedArtifactId]);

  useEffect(() => {
    if (!actionNotice) {
      return undefined;
    }
    const timeout = window.setTimeout(() => setActionNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  const selectedArtifact = useMemo(
    () => data?.artifacts.find((artifact) => artifact.id === selectedArtifactId) ?? null,
    [data, selectedArtifactId],
  );

  const selectedApp = useMemo(
    () => data?.apps.find((app) => app.id === selectedAppId) ?? data?.apps[0] ?? null,
    [data, selectedAppId],
  );

  const selectedAppSkills = useMemo(() => {
    if (!data || !selectedApp) {
      return [];
    }
    return selectedApp.skill_ids
      .map((skillId) => data.skills.find((skill) => skill.id === skillId))
      .filter(Boolean) as SkillDefinition[];
  }, [data, selectedApp]);

  const selectedAgent = useMemo(
    () => data?.agents.find((agent) => agent.id === selectedAgentId) ?? data?.agents[0] ?? null,
    [data, selectedAgentId],
  );

  const commandMessages = useMemo(() => data?.messages.slice(-10) ?? [], [data]);

  const approvalRuns = useMemo(
    () => data?.task_runs.filter((task) => task.requires_approval) ?? [],
    [data],
  );

  const activeAgent = useMemo(() => {
    if (!data) {
      return null;
    }
    const latestTask = data.task_runs[0];
    return (
      data.agents.find((agent) => agent.id === latestTask?.owner_agent_id) ??
      selectedAgent ??
      data.agents[0] ??
      null
    );
  }, [data, selectedAgent]);

  const launchedApp = useMemo(() => {
    if (!data || !commandContext?.launchedAppId) {
      return null;
    }
    return data.apps.find((app) => app.id === commandContext.launchedAppId) ?? null;
  }, [data, commandContext]);

  const selectedAppRun = useMemo(() => {
    if (!data || !selectedApp) {
      return null;
    }
    return (
      data.task_runs.find(
        (task) =>
          task.module === "apps" &&
          task.title.toLowerCase().includes(selectedApp.title.toLowerCase()),
      ) ?? null
    );
  }, [data, selectedApp]);

  const filteredApps = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.apps.filter((app) => appCategoryFilter === "all" || app.category === appCategoryFilter);
  }, [data, appCategoryFilter]);

  const capitalArtifacts = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.artifacts.filter((artifact) =>
      data.investor_room.curated_artifact_ids.includes(artifact.id),
    );
  }, [data]);

  const contextItems = useMemo(() => {
    if (commandContext?.contextItems?.length) {
      return commandContext.contextItems;
    }
    if (!data) {
      return [];
    }
    const defaults = [
      `Mission: ${data.workspace.mission}`,
      `Primary KPI: ${data.workspace.primary_kpi}`,
      ...data.knowledge_sources.slice(0, 2).map((source) => `Knowledge: ${source.title}`),
    ];
    if (selectedArtifact) {
      defaults.push(`Active artifact: ${selectedArtifact.title}`);
    }
    return defaults;
  }, [commandContext, data, selectedArtifact]);

  const nextActions = useMemo(() => {
    if (commandContext?.nextActions?.length) {
      return commandContext.nextActions;
    }
    return defaultSuggestions[commandModule].slice(0, 3);
  }, [commandContext, commandModule]);

  const loadWorkspaceState = async (options?: {
    preferredArtifactId?: string;
    preferredAppId?: string;
    preferredSurface?: SurfaceKey;
  }) => {
    const [bootstrap, workspaceUsers, workspaceUploads] = await Promise.all([
      fetchBootstrap(),
      fetchUsers(),
      fetchUploads(),
    ]);

    setData(bootstrap);
    setUsers(workspaceUsers);
    setUploads(workspaceUploads);

    const nextArtifact =
      bootstrap.artifacts.find((artifact) => artifact.id === options?.preferredArtifactId) ??
      bootstrap.artifacts.find((artifact) => artifact.id === selectedArtifactId) ??
      bootstrap.artifacts[0];
    if (nextArtifact) {
      setSelectedArtifactId(nextArtifact.id);
      setArtifactDraft(nextArtifact.content);
    }

    const nextApp =
      bootstrap.apps.find((app) => app.id === options?.preferredAppId) ??
      bootstrap.apps.find((app) => app.id === selectedAppId) ??
      bootstrap.apps[0];
    if (nextApp) {
      setSelectedAppId(nextApp.id);
    }

    if (options?.preferredSurface) {
      setActiveSurface(options.preferredSurface);
    }
  };

  const handleLogin = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);
      const session = await login(loginForm.email, loginForm.password);
      setAuthToken(session.token);
      setAuthSession(session);
      await loadWorkspaceState();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to log in");
    } finally {
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  const completeOnboarding = async () => {
    try {
      setIsSubmittingPanel(true);
      await updateWorkspace(workspaceForm);
      await loadWorkspaceState({ preferredSurface: "command" });
      if (authSession) {
        window.localStorage.setItem(`vxv-onboarding-complete:${authSession.workspace_id}`, "true");
      }
      setShowOnboarding(false);
      setActiveSurface("command");
      setCommandModule("inbox");
      setActionNotice("Workspace configured. Start from the command thread.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to set up workspace");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!data) {
      return;
    }

    try {
      setIsSending(true);
      const response = await sendFounderMessage({
        module: commandModule,
        message,
        selected_artifact_id: selectedArtifactId || undefined,
      });

      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          messages: [
            ...current.messages,
            {
              id: `temp-user-${Date.now()}`,
              role: "user" as const,
              author: "Founder",
              module: commandModule,
              content: message,
              created_at: new Date().toISOString(),
            },
            response.reply,
          ],
          task_runs: [response.task_run, ...current.task_runs.filter((task) => task.id !== response.task_run.id)],
          artifacts: [
            response.artifact,
            ...current.artifacts.filter((artifact) => artifact.id !== response.artifact.id),
          ],
          metrics: response.updated_metrics,
        };
      });

      setSelectedArtifactId(response.artifact.id);
      setArtifactDraft(response.artifact.content);
      setCommandModule(response.routed_module);
      setCommandContext({
        routedModule: response.routed_module,
        contextItems: response.context_items,
        nextActions: response.next_actions,
        launchedAppId: response.launched_app_id,
      });
      if (response.launched_app_id) {
        setSelectedAppId(response.launched_app_id);
      }
      setActionNotice(`Updated ${response.artifact.title}`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send founder message");
    } finally {
      setIsSending(false);
    }
  };

  const handleLaunchCard = (module: ModuleKey, prompt: string) => {
    if (module === "artifacts") {
      setActiveSurface("artifacts");
    } else if (module === "team") {
      setActiveSurface("workspace");
      setWorkspacePanel("team");
    } else if (module === "capital") {
      setActiveSurface("capital");
    } else {
      setActiveSurface("command");
      setCommandModule(module);
    }
    setComposerDraft(prompt);
  };

  const handleSaveArtifact = async () => {
    if (!selectedArtifact) {
      return;
    }
    try {
      setIsSavingArtifact(true);
      const artifact = await saveArtifact(selectedArtifact.id, artifactDraft);
      setData((current) =>
        current
          ? {
              ...current,
              artifacts: current.artifacts.map((item) => (item.id === artifact.id ? artifact : item)),
            }
          : current,
      );
      setActionNotice(`Saved ${artifact.title}`);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save artifact");
    } finally {
      setIsSavingArtifact(false);
    }
  };

  const handleApproval = async (decision: "approve" | "request_revision" | "reject") => {
    const task = approvalRuns[0];
    if (!task) {
      return;
    }
    try {
      setIsDecidingApproval(true);
      const response = await decideApproval(task.id, decision);
      setData((current) =>
        current
          ? {
              ...current,
              task_runs: current.task_runs.map((item) =>
                item.id === response.task_run.id ? response.task_run : item,
              ),
            }
          : current,
      );
      setActionNotice(response.message);
    } catch (approvalError) {
      setError(
        approvalError instanceof Error ? approvalError.message : "Unable to record approval",
      );
    } finally {
      setIsDecidingApproval(false);
    }
  };

  const handleLaunchApp = async () => {
    if (!selectedApp) {
      return;
    }
    try {
      setIsLaunchingApp(true);
      const response = await launchApp(
        selectedApp.id,
        composerDraft.trim() || `Run ${selectedApp.title} using the latest workspace materials.`,
      );
      await loadWorkspaceState({
        preferredArtifactId: response.artifact?.id ?? undefined,
        preferredAppId: selectedApp.id,
        preferredSurface: "apps",
      });
      setAppSurface("run");
      setActionNotice(response.message);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Unable to launch app");
    } finally {
      setIsLaunchingApp(false);
    }
  };

  const handlePublishInvestorRoom = async () => {
    try {
      setIsPublishingRoom(true);
      const response = await publishInvestorRoom(selectedArtifact?.id);
      setData((current) => (current ? { ...current, investor_room: response.investor_room } : current));
      setCapitalSurface("investor-room");
      setActiveSurface("capital");
      setActionNotice(response.message);
    } catch (publishError) {
      setError(
        publishError instanceof Error ? publishError.message : "Unable to publish investor room",
      );
    } finally {
      setIsPublishingRoom(false);
    }
  };

  const handleUploadDocument = async () => {
    if (!uploadFile) {
      return;
    }
    try {
      setIsUploading(true);
      const response = await uploadDocument(uploadFile, "artifacts", uploadTitle || uploadFile.name);
      await loadWorkspaceState({
        preferredArtifactId: response.artifact.id,
        preferredSurface: "artifacts",
      });
      setUploadFile(null);
      setUploadTitle("");
      setActionNotice(response.message);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Unable to upload document");
    } finally {
      setIsUploading(false);
    }
  };

  const handleWorkspaceSetup = async () => {
    try {
      setIsSubmittingPanel(true);
      await updateWorkspace(workspaceForm);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setActionNotice("Workspace settings updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update workspace");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleCreateGoal = async () => {
    try {
      setIsSubmittingPanel(true);
      await createGoal(goalForm);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setGoalForm((current) => ({ ...current, title: "", kpi: "" }));
      setActionNotice("Strategic goal added.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create goal");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleGoalStatusChange = async (goalId: string, status: string) => {
    try {
      setIsSubmittingPanel(true);
      await updateGoal(goalId, status);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setActionNotice("Goal status updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update goal");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleAddKnowledgeSource = async () => {
    try {
      setIsSubmittingPanel(true);
      await createKnowledgeSource(knowledgeForm);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setKnowledgeForm({
        title: "",
        source_type: "doc",
        status: "Connected",
        freshness: "Today",
      });
      setActionNotice("Knowledge source connected.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add knowledge");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleSaveAgent = async () => {
    if (!selectedAgent) {
      return;
    }
    try {
      setIsSubmittingPanel(true);
      await updateAgent(selectedAgent.id, {
        budget: agentForm.budget,
        permissions: agentForm.permissions
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        escalation_rule: agentForm.escalation_rule,
      });
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setActionNotice(`${selectedAgent.name} updated.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update agent");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleLaunchWorkflow = async (workflowId: string) => {
    try {
      setIsSubmittingPanel(true);
      const response = await launchWorkflow(
        workflowId,
        workflowNote.trim() || "Use the current workspace context and produce a founder-ready output.",
      );
      await loadWorkspaceState({
        preferredArtifactId: response.artifact?.id ?? undefined,
        preferredSurface: "command",
      });
      setWorkflowNote("");
      setActionNotice(response.message);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to launch workflow");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleCreateInvestor = async () => {
    try {
      setIsSubmittingPanel(true);
      await createFundraiseInvestor(investorForm);
      await loadWorkspaceState({ preferredSurface: "capital" });
      setInvestorForm({
        name: "",
        thesis: "",
        stage_fit: "Seed",
        relationship_status: "New",
        next_step: "",
      });
      setActionNotice("Investor added to pipeline.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add investor");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleInvestorUpdate = async (investorId: string) => {
    const draft = investorDrafts[investorId];
    if (!draft) {
      return;
    }
    try {
      setIsSubmittingPanel(true);
      await updateFundraiseInvestor(investorId, draft);
      await loadWorkspaceState({ preferredSurface: "capital" });
      setActionNotice("Investor status updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update investor");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleCreateContact = async () => {
    try {
      setIsSubmittingPanel(true);
      await createContact(contactForm);
      await loadWorkspaceState({ preferredSurface: "capital" });
      setContactForm({
        name: "",
        category: "Advisor",
        company: "",
        relationship_stage: "New",
        last_touch: "",
      });
      setActionNotice("Relationship added.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add contact");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleCreateUser = async () => {
    try {
      setIsSubmittingPanel(true);
      await createUser(userForm);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setUserForm({
        email: "",
        password: "",
        display_name: "",
        role: "member",
      });
      setActionNotice("Workspace user added.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add user");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleUpdateUser = async (email: string) => {
    const draft = userDrafts[email];
    if (!draft) {
      return;
    }
    try {
      setIsSubmittingPanel(true);
      await updateUser(email, draft);
      await loadWorkspaceState({ preferredSurface: "workspace" });
      setActionNotice("Workspace access updated.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update workspace user");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const renderWorkbenchPanel = () => {
    if (!data) {
      return null;
    }

    if (activeSurface === "artifacts") {
      return (
        <div className="split-panel">
          <article className="surface-card split-sidebar compact-list">
            <div className="artifact-list">
              {data.artifacts.map((artifact) => (
                <button
                  key={artifact.id}
                  className={`artifact-list-item ${selectedArtifactId === artifact.id ? "selected" : ""}`}
                  onClick={() => {
                    setSelectedArtifactId(artifact.id);
                    setArtifactDraft(artifact.content);
                  }}
                  type="button"
                >
                  <strong>{artifact.title}</strong>
                  <span>{artifact.summary}</span>
                </button>
              ))}
            </div>
          </article>

          <article className="surface-card split-main">
            <div className="panel-header">
              <div>
                <p className="section-kicker">Active artifact</p>
                <h3>{selectedArtifact?.title ?? "Select an artifact"}</h3>
              </div>
              <div className="segmented-control">
                <button
                  className={artifactView === "preview" ? "active" : ""}
                  onClick={() => setArtifactView("preview")}
                  type="button"
                >
                  Preview
                </button>
                <button
                  className={artifactView === "edit" ? "active" : ""}
                  onClick={() => setArtifactView("edit")}
                  type="button"
                >
                  Edit
                </button>
              </div>
            </div>
            {artifactView === "preview" ? (
              <div className="artifact-preview prose-surface">
                {selectedArtifact ? (
                  <MarkdownRenderer content={selectedArtifact.content} />
                ) : (
                  <p>Select an artifact to review it.</p>
                )}
              </div>
            ) : (
              <textarea
                className="artifact-editor"
                rows={18}
                value={artifactDraft}
                onChange={(event) => setArtifactDraft(event.target.value)}
              />
            )}
            <div className="button-row">
              <button
                className="primary-action"
                disabled={isSavingArtifact || !selectedArtifact}
                onClick={() => void handleSaveArtifact()}
                type="button"
              >
                {isSavingArtifact ? "Saving..." : "Save artifact"}
              </button>
              <button
                className="ghost-action"
                disabled={isPublishingRoom || !selectedArtifact}
                onClick={() => void handlePublishInvestorRoom()}
                type="button"
              >
                {isPublishingRoom ? "Publishing..." : "Publish to investor room"}
              </button>
            </div>
          </article>
        </div>
      );
    }

    if (activeSurface === "apps") {
      return (
        <>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Apps</p>
              <h3>Run focused workflows without leaving the workspace</h3>
            </div>
            <div className="segmented-control">
              <button
                className={appSurface === "library" ? "active" : ""}
                onClick={() => setAppSurface("library")}
                type="button"
              >
                Library
              </button>
              <button
                className={appSurface === "run" ? "active" : ""}
                onClick={() => setAppSurface("run")}
                type="button"
              >
                Run view
              </button>
            </div>
          </div>

          {appSurface === "library" ? (
            <>
              <div className="command-focus-row">
                {appCategories.map((category) => (
                  <button
                    key={category}
                    className={`prompt-chip ${appCategoryFilter === category ? "active-chip" : ""}`}
                    onClick={() => setAppCategoryFilter(category)}
                    type="button"
                  >
                    {category === "all" ? "All" : categoryLabel(category)}
                  </button>
                ))}
              </div>
              <div className="card-grid card-grid-three">
                {filteredApps.map((app) => (
                  <article key={app.id} className="surface-card action-card compact-card">
                    <p className="card-tag">{categoryLabel(app.category)}</p>
                    <h3>{app.title}</h3>
                    <p>{app.summary}</p>
                    <div className="tag-strip">
                      {app.skill_ids.map((skillId) => (
                        <span key={skillId} className="tag-chip">
                          {data.skills.find((skill) => skill.id === skillId)?.name ?? skillId}
                        </span>
                      ))}
                    </div>
                    <div className="button-row">
                      <button
                        className="primary-action"
                        onClick={() => {
                          setSelectedAppId(app.id);
                          setAppSurface("run");
                        }}
                        type="button"
                      >
                        Open app
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="split-panel">
              <article className="surface-card split-sidebar">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">App run</p>
                    <h3>{selectedApp?.title ?? "Select an app"}</h3>
                  </div>
                  {selectedAppRun ? <span className="status-pill success">{selectedAppRun.status}</span> : null}
                </div>
                <p>{selectedApp?.summary ?? "Choose an app from the library to begin."}</p>
                <div className="tag-strip">
                  {selectedAppSkills.map((skill) => (
                    <span key={skill.id} className="tag-chip">
                      {skill.name}
                    </span>
                  ))}
                </div>
                <label className="field field-full">
                  <span>Run prompt</span>
                  <textarea
                    className="composer-input"
                    rows={7}
                    value={composerDraft}
                    onChange={(event) => setComposerDraft(event.target.value)}
                    placeholder="Describe what this app should do with the current workspace context."
                  />
                </label>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isLaunchingApp || !selectedApp}
                    onClick={() => void handleLaunchApp()}
                    type="button"
                  >
                    {isLaunchingApp ? "Launching..." : "Run app"}
                  </button>
                </div>
              </article>

              <article className="surface-card split-main">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Output</p>
                    <h3>{selectedArtifact?.title ?? "App outputs appear here"}</h3>
                  </div>
                </div>
                <div className="artifact-preview prose-surface">
                  {selectedArtifact ? (
                    <MarkdownRenderer content={selectedArtifact.content} />
                  ) : (
                    <p>Run an app to create a linked artifact and execution trace.</p>
                  )}
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isSavingArtifact || !selectedArtifact}
                    onClick={() => void handleSaveArtifact()}
                    type="button"
                  >
                    {isSavingArtifact ? "Saving..." : "Save to artifacts"}
                  </button>
                  <button
                    className="ghost-action"
                    disabled={isPublishingRoom || !selectedArtifact}
                    onClick={() => void handlePublishInvestorRoom()}
                    type="button"
                  >
                    {isPublishingRoom ? "Publishing..." : "Publish to investor room"}
                  </button>
                </div>
              </article>
            </div>
          )}
        </>
      );
    }

    if (activeSurface === "capital") {
      return (
        <>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Capital</p>
              <h3>Investor pipeline and investor room</h3>
            </div>
            <div className="segmented-control">
              <button
                className={capitalSurface === "workspace" ? "active" : ""}
                onClick={() => setCapitalSurface("workspace")}
                type="button"
              >
                Pipeline
              </button>
              <button
                className={capitalSurface === "investor-room" ? "active" : ""}
                onClick={() => setCapitalSurface("investor-room")}
                type="button"
              >
                Investor room
              </button>
            </div>
          </div>

          {capitalSurface === "workspace" ? (
            <div className="two-column">
              <article className="surface-card">
                <h4>{data.fundraise_pipeline.round_name}</h4>
                <p>{data.fundraise_pipeline.narrative}</p>
                <div className="list-stack compact-list">
                  {data.fundraise_pipeline.investors.map((investor) => (
                    <div key={investor.id} className="surface-card inset-card">
                      <strong>{investor.name}</strong>
                      <p>{investor.thesis}</p>
                      <div className="surface-inline-editor">
                        <label className="field">
                          <span>Relationship</span>
                          <input
                            value={investorDrafts[investor.id]?.relationship_status ?? investor.relationship_status}
                            onChange={(event) =>
                              setInvestorDrafts((current) => ({
                                ...current,
                                [investor.id]: {
                                  relationship_status: event.target.value,
                                  next_step: current[investor.id]?.next_step ?? investor.next_step,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="field field-full">
                          <span>Next step</span>
                          <input
                            value={investorDrafts[investor.id]?.next_step ?? investor.next_step}
                            onChange={(event) =>
                              setInvestorDrafts((current) => ({
                                ...current,
                                [investor.id]: {
                                  relationship_status:
                                    current[investor.id]?.relationship_status ?? investor.relationship_status,
                                  next_step: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <div className="button-row inline-editor-actions">
                          <button
                            className="ghost-action"
                            disabled={isSubmittingPanel}
                            onClick={() => void handleInvestorUpdate(investor.id)}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="surface-card">
                <div className="form-grid">
                  <label className="field">
                    <span>Investor</span>
                    <input
                      value={investorForm.name}
                      onChange={(event) =>
                        setInvestorForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Stage fit</span>
                    <input
                      value={investorForm.stage_fit}
                      onChange={(event) =>
                        setInvestorForm((current) => ({ ...current, stage_fit: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Thesis</span>
                    <textarea
                      rows={3}
                      value={investorForm.thesis}
                      onChange={(event) =>
                        setInvestorForm((current) => ({ ...current, thesis: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Next step</span>
                    <input
                      value={investorForm.next_step}
                      onChange={(event) =>
                        setInvestorForm((current) => ({ ...current, next_step: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleCreateInvestor()}
                    type="button"
                  >
                    Add investor
                  </button>
                </div>

                <div className="form-grid">
                  <label className="field">
                    <span>Relationship</span>
                    <input
                      value={contactForm.name}
                      onChange={(event) =>
                        setContactForm((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Company</span>
                    <input
                      value={contactForm.company}
                      onChange={(event) =>
                        setContactForm((current) => ({ ...current, company: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleCreateContact()}
                    type="button"
                  >
                    Add relationship
                  </button>
                </div>
              </article>
            </div>
          ) : (
            <div className="two-column">
              <article className="surface-card">
                <p className="section-kicker">Investor room</p>
                <h4>{data.investor_room.title}</h4>
                <p>{data.investor_room.headline}</p>
                <div className="tag-strip">
                  {data.investor_room.diligence_items.map((item) => (
                    <span key={item} className="tag-chip">
                      {item}
                    </span>
                  ))}
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isPublishingRoom}
                    onClick={() => void handlePublishInvestorRoom()}
                    type="button"
                  >
                    {isPublishingRoom ? "Publishing..." : "Refresh investor room"}
                  </button>
                </div>
              </article>

              <article className="surface-card">
                <h4>Curated materials</h4>
                <div className="list-stack">
                  {capitalArtifacts.map((artifact) => (
                    <button
                      key={artifact.id}
                      className="artifact-list-item"
                      onClick={() => {
                        setSelectedArtifactId(artifact.id);
                        setArtifactDraft(artifact.content);
                        setActiveSurface("artifacts");
                      }}
                      type="button"
                    >
                      <strong>{artifact.title}</strong>
                      <span>{artifact.summary}</span>
                    </button>
                  ))}
                </div>
              </article>
            </div>
          )}
        </>
      );
    }

    if (activeSurface === "workspace") {
      return (
        <>
          <div className="panel-header">
            <div>
              <p className="section-kicker">Workspace</p>
              <h3>Settings, access, and knowledge</h3>
            </div>
            <div className="segmented-control">
              <button
                className={workspacePanel === "setup" ? "active" : ""}
                onClick={() => setWorkspacePanel("setup")}
                type="button"
              >
                Setup
              </button>
              <button
                className={workspacePanel === "team" ? "active" : ""}
                onClick={() => setWorkspacePanel("team")}
                type="button"
              >
                Team
              </button>
              <button
                className={workspacePanel === "knowledge" ? "active" : ""}
                onClick={() => setWorkspacePanel("knowledge")}
                type="button"
              >
                Knowledge
              </button>
            </div>
          </div>

          {workspacePanel === "setup" ? (
            <div className="two-column">
              <article className="surface-card">
                <div className="form-grid">
                  <label className="field">
                    <span>Company</span>
                    <input
                      value={workspaceForm.company_name}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, company_name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Founder</span>
                    <input
                      value={workspaceForm.founder_name}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, founder_name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Stage</span>
                    <input
                      value={workspaceForm.stage}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, stage: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Primary KPI</span>
                    <input
                      value={workspaceForm.primary_kpi}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, primary_kpi: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Mission</span>
                    <textarea
                      rows={3}
                      value={workspaceForm.mission}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Operating summary</span>
                    <textarea
                      rows={3}
                      value={workspaceForm.summary}
                      onChange={(event) =>
                        setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleWorkspaceSetup()}
                    type="button"
                  >
                    {isSubmittingPanel ? "Saving..." : "Update workspace"}
                  </button>
                </div>
              </article>

              <article className="surface-card">
                <h4>Goals</h4>
                <div className="list-stack compact-list">
                  {data.goals.map((goal) => (
                    <div key={goal.id} className="surface-card inset-card">
                      <strong>{goal.title}</strong>
                      <p>{goal.kpi}</p>
                      <div className="button-row">
                        {["Planned", "In flight", "Ready", "Complete"].map((status) => (
                          <button
                            key={status}
                            className="ghost-action"
                            disabled={isSubmittingPanel}
                            onClick={() => void handleGoalStatusChange(goal.id, status)}
                            type="button"
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field field-full">
                    <span>Goal</span>
                    <input
                      value={goalForm.title}
                      onChange={(event) =>
                        setGoalForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>KPI</span>
                    <input
                      value={goalForm.kpi}
                      onChange={(event) =>
                        setGoalForm((current) => ({ ...current, kpi: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Due date</span>
                    <input
                      value={goalForm.due_date}
                      onChange={(event) =>
                        setGoalForm((current) => ({ ...current, due_date: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleCreateGoal()}
                    type="button"
                  >
                    Add goal
                  </button>
                </div>
              </article>
            </div>
          ) : null}

          {workspacePanel === "team" ? (
            <div className="two-column">
              <article className="surface-card">
                <div className="artifact-list">
                  {data.agents.map((agent) => (
                    <button
                      key={agent.id}
                      className={`artifact-list-item ${selectedAgentId === agent.id ? "selected" : ""}`}
                      onClick={() => setSelectedAgentId(agent.id)}
                      type="button"
                    >
                      <strong>{agent.name}</strong>
                      <span>{agent.summary}</span>
                    </button>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Budget</span>
                    <input
                      value={agentForm.budget}
                      onChange={(event) =>
                        setAgentForm((current) => ({ ...current, budget: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Permissions</span>
                    <input
                      value={agentForm.permissions}
                      onChange={(event) =>
                        setAgentForm((current) => ({ ...current, permissions: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field field-full">
                    <span>Escalation rule</span>
                    <textarea
                      rows={3}
                      value={agentForm.escalation_rule}
                      onChange={(event) =>
                        setAgentForm((current) => ({ ...current, escalation_rule: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleSaveAgent()}
                    type="button"
                  >
                    Save guardrails
                  </button>
                </div>
              </article>

              <article className="surface-card">
                <div className="list-stack compact-list">
                  {users.map((user) => (
                    <div key={user.email} className="surface-card inset-card">
                      <strong>{user.display_name}</strong>
                      <p>{user.email}</p>
                      <div className="surface-inline-editor">
                        <label className="field">
                          <span>Role</span>
                          <input
                            value={userDrafts[user.email]?.role ?? user.role}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [user.email]: {
                                  display_name: current[user.email]?.display_name ?? user.display_name,
                                  role: event.target.value,
                                  status: current[user.email]?.status ?? user.status,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Status</span>
                          <input
                            value={userDrafts[user.email]?.status ?? user.status}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [user.email]: {
                                  display_name: current[user.email]?.display_name ?? user.display_name,
                                  role: current[user.email]?.role ?? user.role,
                                  status: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <div className="button-row inline-editor-actions">
                          <button
                            className="ghost-action"
                            disabled={isSubmittingPanel}
                            onClick={() => void handleUpdateUser(user.email)}
                            type="button"
                          >
                            Save
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Name</span>
                    <input
                      value={userForm.display_name}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, display_name: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Role</span>
                    <input
                      value={userForm.role}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, role: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Email</span>
                    <input
                      value={userForm.email}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, email: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Password</span>
                    <input
                      type="password"
                      value={userForm.password}
                      onChange={(event) =>
                        setUserForm((current) => ({ ...current, password: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleCreateUser()}
                    type="button"
                  >
                    Add user
                  </button>
                </div>
              </article>
            </div>
          ) : null}

          {workspacePanel === "knowledge" ? (
            <div className="two-column">
              <article className="surface-card">
                <div className="list-stack compact-list">
                  {data.knowledge_sources.map((source) => (
                    <div key={source.id} className="list-row">
                      <div>
                        <strong>{source.title}</strong>
                        <p>
                          {source.source_type} · {source.status} · {source.freshness}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="form-grid">
                  <label className="field">
                    <span>Source title</span>
                    <input
                      value={knowledgeForm.title}
                      onChange={(event) =>
                        setKnowledgeForm((current) => ({ ...current, title: event.target.value }))
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Type</span>
                    <input
                      value={knowledgeForm.source_type}
                      onChange={(event) =>
                        setKnowledgeForm((current) => ({ ...current, source_type: event.target.value }))
                      }
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="ghost-action"
                    disabled={isSubmittingPanel}
                    onClick={() => void handleAddKnowledgeSource()}
                    type="button"
                  >
                    Add knowledge source
                  </button>
                </div>
              </article>

              <article className="surface-card">
                <div className="form-grid">
                  <label className="field field-full">
                    <span>Title</span>
                    <input
                      value={uploadTitle}
                      onChange={(event) => setUploadTitle(event.target.value)}
                    />
                  </label>
                  <label className="field field-full">
                    <span>Document</span>
                    <input
                      type="file"
                      onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                    />
                  </label>
                </div>
                <div className="button-row">
                  <button
                    className="primary-action"
                    disabled={isUploading || !uploadFile}
                    onClick={() => void handleUploadDocument()}
                    type="button"
                  >
                    {isUploading ? "Uploading..." : "Upload document"}
                  </button>
                </div>
                <div className="list-stack compact-list">
                  {uploads.slice(0, 5).map((upload) => (
                    <div key={upload.id} className="list-row">
                      <div>
                        <strong>{upload.filename}</strong>
                        <p>
                          {upload.storage_backend} · {formatTimestamp(upload.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>
          ) : null}
        </>
      );
    }

    return (
      <div className="linked-tools-grid">
        <article className="surface-card inset-card">
          <p className="section-kicker">Active artifact</p>
          <h4>{selectedArtifact?.title ?? "No artifact yet"}</h4>
          <p>{selectedArtifact?.summary ?? "The first durable output from this thread will appear here."}</p>
          <button className="inline-link" onClick={() => setActiveSurface("artifacts")} type="button">
            Open artifacts
          </button>
        </article>
        <article className="surface-card inset-card">
          <p className="section-kicker">Suggested app</p>
          <h4>{launchedApp?.title ?? selectedApp?.title ?? "No app selected"}</h4>
          <p>{launchedApp?.summary ?? selectedApp?.summary ?? "When a richer workflow is needed, launch it from here."}</p>
          <button
            className="inline-link"
            onClick={() => {
              setActiveSurface("apps");
              setAppSurface("run");
            }}
            type="button"
          >
            Open app run
          </button>
        </article>
        <article className="surface-card inset-card">
          <p className="section-kicker">Capital state</p>
          <h4>{data.fundraise_pipeline.round_name}</h4>
          <p>{data.fundraise_pipeline.narrative}</p>
          <button className="inline-link" onClick={() => setActiveSurface("capital")} type="button">
            Open capital
          </button>
        </article>
      </div>
    );
  };

  if (isLoading) {
    return <div className="app-state">Loading VXV Workspace...</div>;
  }

  if (!authSession) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <p className="section-kicker">Founder access</p>
          <h1>Enter VXV Workspace</h1>
          <p>Sign in and land directly in the command workspace.</p>
          {error ? <p className="action-error">{error}</p> : null}
          <div className="form-grid">
            <label className="field field-full">
              <span>Email</span>
              <input
                value={loginForm.email}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, email: event.target.value }))
                }
              />
            </label>
            <label className="field field-full">
              <span>Password</span>
              <input
                type="password"
                value={loginForm.password}
                onChange={(event) =>
                  setLoginForm((current) => ({ ...current, password: event.target.value }))
                }
              />
            </label>
          </div>
          <div className="button-row">
            <button
              className="primary-action"
              disabled={isAuthenticating}
              onClick={() => void handleLogin()}
              type="button"
            >
              {isAuthenticating ? "Signing in..." : "Enter workspace"}
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="app-state">
        <p>Unable to load the founder workspace.</p>
        {error ? <code>{error}</code> : null}
      </div>
    );
  }

  if (showOnboarding) {
    return (
      <div className="onboarding-shell">
        <aside className="onboarding-sidebar">
          <div className="brand-stack">
            <div className="brand-mark">VXV Workspace</div>
            <div className="brand-subtitle">Founder operating system</div>
          </div>
          <div className="onboarding-steps">
            <div className="onboarding-step active">
              <small>Step 1</small>
              <strong>Founding context</strong>
              <p>Set company, stage, mission, and KPI.</p>
            </div>
            <div className="onboarding-step">
              <small>Step 2</small>
              <strong>First workflows</strong>
              <p>Pick the first goals, knowledge, and operator behaviors.</p>
            </div>
            <div className="onboarding-step">
              <small>Step 3</small>
              <strong>Enter command</strong>
              <p>Start in one thread and pull in other surfaces only when needed.</p>
            </div>
          </div>
        </aside>

        <main className="onboarding-main">
          <section className="surface-card onboarding-card">
            <p className="section-kicker">Set up your workspace</p>
            <h1>Configure the founder operating environment, then land directly in command.</h1>
            <p className="section-copy">
              Keep this practical. Define the company context and the system will use it to route work.
            </p>

            <div className="form-grid">
              <label className="field">
                <span>Company</span>
                <input
                  value={workspaceForm.company_name}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, company_name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Founder</span>
                <input
                  value={workspaceForm.founder_name}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, founder_name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Stage</span>
                <input
                  value={workspaceForm.stage}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, stage: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span>Primary KPI</span>
                <input
                  value={workspaceForm.primary_kpi}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, primary_kpi: event.target.value }))
                  }
                />
              </label>
              <label className="field field-full">
                <span>Mission</span>
                <textarea
                  rows={3}
                  value={workspaceForm.mission}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, mission: event.target.value }))
                  }
                />
              </label>
              <label className="field field-full">
                <span>Operating summary</span>
                <textarea
                  rows={3}
                  value={workspaceForm.summary}
                  onChange={(event) =>
                    setWorkspaceForm((current) => ({ ...current, summary: event.target.value }))
                  }
                />
              </label>
            </div>

            <section className="card-grid card-grid-three">
              {founderLaunchCards.slice(0, 3).map((card) => (
                <article key={card.title} className="surface-card action-card compact-card">
                  <p className="card-tag">First workflow</p>
                  <h3>{card.title}</h3>
                  <p>{card.body}</p>
                </article>
              ))}
            </section>

            <div className="button-row">
              <button
                className="primary-action"
                disabled={isSubmittingPanel}
                onClick={() => void completeOnboarding()}
                type="button"
              >
                {isSubmittingPanel ? "Entering..." : "Enter command workspace"}
              </button>
            </div>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="vxv-shell command-first-shell">
      <aside className="workspace-nav">
        <div className="brand-stack">
          <div className="brand-mark">VXV Workspace</div>
          <div className="brand-subtitle">Founder operating system</div>
        </div>

        <nav className="primary-nav" aria-label="Workspace surfaces">
          {surfaceOrder.map((surface) => (
            <button
              key={surface}
              className={`nav-item ${activeSurface === surface ? "active" : ""}`}
              onClick={() => setActiveSurface(surface)}
              type="button"
            >
              <span>{surfaceMeta[surface].label}</span>
              <small>{surfaceMeta[surface].kicker}</small>
            </button>
          ))}
        </nav>

        <div className="workspace-nav-footer">
          <button className="secondary-nav-button" onClick={() => setShowOnboarding(true)} type="button">
            Reopen onboarding
          </button>
          <button
            className="secondary-nav-button"
            onClick={() => {
              clearAuthToken();
              setAuthSession(null);
            }}
            type="button"
          >
            Log out
          </button>
          <div className="founder-chip">
            <div className="founder-avatar">
              {authSession.display_name.slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{authSession.display_name}</strong>
              <p>{data.workspace.stage}</p>
            </div>
          </div>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <div>
            <p className="section-kicker">Command workspace</p>
            <h1>One thread should coordinate the rest of the platform.</h1>
            <p className="section-copy">
              Ask, route, run, store, and continue. Use the workbench only when the thread needs a
              deeper surface.
            </p>
            {actionNotice ? <p className="action-notice">{actionNotice}</p> : null}
            {error ? <p className="action-error">{error}</p> : null}
          </div>
          <div className="topbar-actions">
            <div className="topbar-pill topbar-pill-accent">Session active</div>
            <div className="topbar-pill">{data.integrations.mode}</div>
            <div className="topbar-pill">{authSession.role}</div>
            {data.integrations.runtime_provider ? (
              <div className="topbar-pill">{data.integrations.runtime_provider}</div>
            ) : null}
          </div>
        </header>

        <div className="content-layout">
          <main className="content-pane">
            <section className="hero-panel compact">
              <div>
                <p className="section-kicker">Founder command loop</p>
                <h2>Start here. Let the workspace gather context, choose tools, and keep the work connected.</h2>
                <p>
                  Chat is the center of the product. Apps, artifacts, capital workflows, and admin surfaces
                  should appear only when they help the current thread move forward.
                </p>
              </div>
              <div className="hero-metrics">
                <div className="metric-card">
                  <span>Active goals</span>
                  <strong>{data.metrics.active_goals}</strong>
                </div>
                <div className="metric-card">
                  <span>Runs in motion</span>
                  <strong>{data.metrics.running_tasks}</strong>
                </div>
                <div className="metric-card">
                  <span>Artifacts ready</span>
                  <strong>{data.metrics.ready_artifacts}</strong>
                </div>
                <div className="metric-card">
                  <span>Warm investors</span>
                  <strong>{data.metrics.warm_investors}</strong>
                </div>
              </div>
            </section>

            <section className="surface-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Command focus</p>
                  <h3>Choose the lens for this thread</h3>
                </div>
              </div>
              <div className="command-focus-row">
                {commandFocusModules.map((module) => (
                  <button
                    key={module}
                    className={`prompt-chip ${commandModule === module ? "active-chip" : ""}`}
                    onClick={() => setCommandModule(module)}
                    type="button"
                  >
                    {moduleMeta[module].label}
                  </button>
                ))}
              </div>
              <p className="surface-help">{moduleMeta[commandModule].description}</p>
            </section>

            <section className="surface-card command-thread-card">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Founder thread</p>
                  <h3>Ask once, then keep working in the same place</h3>
                </div>
                {activeAgent ? <span className="status-pill success">{activeAgent.name}</span> : null}
              </div>

              <div className="conversation-thread command-thread">
                {commandMessages.map((message) => (
                  <article
                    key={message.id}
                    className={`message-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
                  >
                    <div className="message-meta">
                      <strong>{message.author}</strong>
                      <span>{formatTimestamp(message.created_at)}</span>
                    </div>
                    {message.role === "assistant" ? (
                      <MarkdownRenderer content={message.content} />
                    ) : (
                      <p>{message.content}</p>
                    )}
                  </article>
                ))}
              </div>

              <div className="prompt-row">
                {defaultSuggestions[commandModule].map((suggestion) => (
                  <button
                    key={suggestion}
                    className="prompt-chip"
                    onClick={() => void handleSendMessage(suggestion)}
                    type="button"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>

              <div className="composer">
                <textarea
                  aria-label="Founder prompt"
                  className="composer-input"
                  rows={5}
                  placeholder="Ask the workspace to research, plan, coordinate, launch an app, or produce an artifact..."
                  value={composerDraft}
                  onChange={(event) => setComposerDraft(event.target.value)}
                />
                <button
                  className="primary-action"
                  disabled={isSending}
                  onClick={() => {
                    const value = composerDraft.trim();
                    if (!value) {
                      return;
                    }
                    setComposerDraft("");
                    void handleSendMessage(value);
                  }}
                  type="button"
                >
                  {isSending ? "Sending..." : "Send to workspace"}
                </button>
              </div>
            </section>

            <section className="two-column">
              <article className="surface-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Suggested flows</p>
                    <h3>Start common founder motions quickly</h3>
                  </div>
                </div>
                <div className="card-grid card-grid-two">
                  {founderLaunchCards.map((card) => (
                    <article key={card.title} className="surface-card action-card compact-card">
                      <p className="card-tag">Command shortcut</p>
                      <h3>{card.title}</h3>
                      <p>{card.body}</p>
                      <button
                        className="inline-link"
                        onClick={() => handleLaunchCard(card.module, card.prompt)}
                        type="button"
                      >
                        {card.action}
                      </button>
                    </article>
                  ))}
                </div>
              </article>

              <article className="surface-card">
                <div className="panel-header">
                  <div>
                    <p className="section-kicker">Workflow launcher</p>
                    <h3>Move from thread to structured execution</h3>
                  </div>
                </div>
                <div className="list-stack compact-list">
                  {data.workflows.slice(0, 4).map((workflow) => (
                    <div key={workflow.id} className="surface-card inset-card">
                      <strong>{workflow.title}</strong>
                      <p>{workflow.description}</p>
                      <div className="button-row">
                        <button
                          className="ghost-action"
                          disabled={isSubmittingPanel}
                          onClick={() => void handleLaunchWorkflow(workflow.id)}
                          type="button"
                        >
                          Launch workflow
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <label className="field field-full">
                  <span>Workflow note</span>
                  <textarea
                    rows={3}
                    value={workflowNote}
                    onChange={(event) => setWorkflowNote(event.target.value)}
                  />
                </label>
              </article>
            </section>

            <section className="surface-card workbench-panel">
              <div className="panel-header">
                <div>
                  <p className="section-kicker">Connected workbench</p>
                  <h3>Open the deeper surface only when the thread needs it</h3>
                </div>
              </div>
              <div className="workbench-tabs">
                {surfaceOrder.map((surface) => (
                  <button
                    key={surface}
                    className={activeSurface === surface ? "active" : ""}
                    onClick={() => setActiveSurface(surface)}
                    type="button"
                  >
                    {surfaceMeta[surface].label}
                  </button>
                ))}
              </div>
              {renderWorkbenchPanel()}
            </section>
          </main>

          <aside className="context-rail">
            <section className="context-card context-rail-heading">
              <p className="section-kicker">Context rail</p>
              <h3>Operating context</h3>
              <p>Keep the active artifact, run trace, approvals, and next actions visible while the thread moves.</p>
            </section>

            <section className="context-card">
              <p className="section-kicker">Active artifact</p>
              <h3>{selectedArtifact?.title ?? "No active artifact"}</h3>
              <p>
                {selectedArtifact?.summary ??
                  "The current output will surface here when the system creates or refreshes one."}
              </p>
            </section>

            <section className="context-card">
              <p className="section-kicker">Run trace</p>
              <h3>Recent execution</h3>
              <div className="timeline-list">
                {data.task_runs.slice(0, 4).map((task) => (
                  <div key={task.id} className="timeline-item">
                    <strong>{task.title}</strong>
                    <p>{task.trace_summary}</p>
                    <small>{formatTimestamp(task.created_at)}</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="context-card">
              <p className="section-kicker">Context used</p>
              <h3>Sources and memory</h3>
              <div className="list-stack">
                {contextItems.map((item) => (
                  <div key={item} className="list-row">
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="context-card">
              <p className="section-kicker">Approvals</p>
              <h3>Human-in-the-loop</h3>
              <div className="list-stack">
                {(approvalRuns.length > 0 ? approvalRuns : data.task_runs.slice(0, 2)).map((task) => (
                  <div key={task.id} className="list-row">
                    <div>
                      <strong>{task.title}</strong>
                      <p>{task.progress_label}</p>
                    </div>
                    <span className={`status-pill ${task.requires_approval ? "warning" : "success"}`}>
                      {task.requires_approval ? "Pending" : "Tracked"}
                    </span>
                  </div>
                ))}
              </div>
              {approvalRuns[0] ? (
                <div className="button-row stacked-buttons">
                  <button
                    className="primary-action"
                    disabled={isDecidingApproval}
                    onClick={() => void handleApproval("approve")}
                    type="button"
                  >
                    Approve
                  </button>
                  <button
                    className="ghost-action"
                    disabled={isDecidingApproval}
                    onClick={() => void handleApproval("request_revision")}
                    type="button"
                  >
                    Request revision
                  </button>
                  <button
                    className="ghost-action"
                    disabled={isDecidingApproval}
                    onClick={() => void handleApproval("reject")}
                    type="button"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </section>

            <section className="context-card">
              <p className="section-kicker">Next actions</p>
              <h3>Continue from here</h3>
              <div className="list-stack">
                {nextActions.map((item) => (
                  <div key={item} className="list-row">
                    <strong>{item}</strong>
                  </div>
                ))}
              </div>
            </section>

            {(launchedApp ?? selectedApp) ? (
              <section className="context-card">
                <p className="section-kicker">Suggested app</p>
                <h3>{(launchedApp ?? selectedApp)?.title}</h3>
                <p>{(launchedApp ?? selectedApp)?.summary}</p>
                <div className="button-row">
                  <button
                    className="ghost-action"
                    onClick={() => {
                      setActiveSurface("apps");
                      setAppSurface("run");
                      if (launchedApp) {
                        setSelectedAppId(launchedApp.id);
                      }
                    }}
                    type="button"
                  >
                    Open app
                  </button>
                </div>
              </section>
            ) : null}

            {activeAgent ? (
              <section className="context-card">
                <p className="section-kicker">Active agent</p>
                <h3>{activeAgent.name}</h3>
                <p>{activeAgent.summary}</p>
                <div className="tag-strip">
                  {activeAgent.tools.map((tool) => (
                    <span key={tool} className="tag-chip">
                      {tool}
                    </span>
                  ))}
                </div>
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

export default App;
