import { Markdown } from "@agentscope-ai/chat";
import { useEffect, useMemo, useState } from "react";

import {
  clearAuthToken,
  createContact,
  createFundraiseInvestor,
  createGoal,
  createKnowledgeSource,
  decideApproval,
  fetchSession,
  fetchBootstrap,
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
  updateWorkspace,
  uploadDocument,
} from "./lib/api";
import type {
  AppCategory,
  Artifact,
  AuthSession,
  BootstrapResponse,
  ChatMessage,
  ModuleKey,
  SkillDefinition,
  WorkspaceApp,
} from "./types";

const moduleOrder: ModuleKey[] = [
  "inbox",
  "strategy",
  "team",
  "execution",
  "artifacts",
  "capital",
  "apps",
];

const moduleMeta: Record<
  ModuleKey,
  { label: string; kicker: string; description: string; statLabel: string }
> = {
  inbox: {
    label: "Inbox",
    kicker: "Founder command center",
    description: "Steer the workspace, approvals, and active runs from one operating surface.",
    statLabel: "Approvals",
  },
  strategy: {
    label: "Strategy",
    kicker: "Planning and research",
    description: "Turn founder questions into goals, briefs, research, and GTM direction.",
    statLabel: "Goals",
  },
  team: {
    label: "Team",
    kicker: "Agent roster",
    description: "Staff the AI-native team with roles, tools, budgets, and escalation rules.",
    statLabel: "Agents",
  },
  execution: {
    label: "Execution",
    kicker: "Operating cadence",
    description: "Keep work moving through workflows, weekly reviews, and accountable run traces.",
    statLabel: "Runs",
  },
  artifacts: {
    label: "Artifacts",
    kicker: "Company memory",
    description: "Keep every meaningful output linked to a run, an owner, and a publish path.",
    statLabel: "Outputs",
  },
  capital: {
    label: "Capital",
    kicker: "Fundraising workspace",
    description: "Manage investor readiness, diligence, and a curated investor room from the same shell.",
    statLabel: "Investors",
  },
  apps: {
    label: "Apps",
    kicker: "Workflow tools",
    description: "Launch immersive workflow apps that compose skills, runs, and output artifacts.",
    statLabel: "Apps",
  },
};

const defaultSuggestions: Record<ModuleKey, string[]> = {
  inbox: [
    "What needs my approval this week?",
    "Summarize blockers across the workspace",
    "Draft the founder's top 3 priorities",
  ],
  strategy: [
    "Turn the vision into a 90-day operating plan",
    "Draft a GTM experiment backlog",
    "Create a customer research sprint brief",
  ],
  team: [
    "Design the first AI agent team for VXV",
    "Propose role guardrails and budgets",
    "What should stay human-in-the-loop?",
  ],
  execution: [
    "Set up a weekly founder review cadence",
    "Design an execution scoreboard",
    "Turn the current plan into workflows",
  ],
  artifacts: [
    "Draft a founder brief from the current strategy",
    "Create an investor update from recent progress",
    "Turn this workspace into a board memo",
  ],
  capital: [
    "Refresh the investor memo",
    "Build a diligence room checklist",
    "Prioritize the next 10 investors to approach",
  ],
  apps: [
    "Run the pitch deck reviewer on the latest deck",
    "Create an investor update using the app layer",
    "What app should I use for customer research this week?",
  ],
};

const founderLaunchCards = [
  {
    title: "Define your first goal",
    body: "Establish the primary metric or objective driving your current cycle.",
    action: "Set objective",
    module: "strategy" as ModuleKey,
    prompt: "Turn our founder vision into one primary strategic goal and KPI for the next 90 days.",
  },
  {
    title: "Launch your first AI teammate",
    body: "Select a specialist in analysis, growth, or operations to join the workspace.",
    action: "Select specialization",
    module: "team" as ModuleKey,
    prompt: "Design the first AI agent team for VXV with roles, budgets, and escalation rules.",
  },
  {
    title: "Connect company knowledge",
    body: "Ingest docs, meeting transcripts, and project boards to grow workspace memory.",
    action: "Sync data",
    module: "artifacts" as ModuleKey,
    prompt: "Draft the first workspace artifact and knowledge ingestion plan for VXV.",
  },
  {
    title: "Start a weekly founder review",
    body: "Establish a structured ritual for progress, blockers, and next moves.",
    action: "Schedule session",
    module: "execution" as ModuleKey,
    prompt: "Set up a weekly founder review cadence with KPIs, blockers, and decision checkpoints.",
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
  const [activeModule, setActiveModule] = useState<ModuleKey>("inbox");
  const [selectedArtifactId, setSelectedArtifactId] = useState("");
  const [artifactDraft, setArtifactDraft] = useState("");
  const [artifactView, setArtifactView] = useState<"preview" | "edit">("preview");
  const [capitalSurface, setCapitalSurface] = useState<"workspace" | "investor-room">("workspace");
  const [appSurface, setAppSurface] = useState<"library" | "run">("library");
  const [selectedAppId, setSelectedAppId] = useState("");
  const [appCategoryFilter, setAppCategoryFilter] = useState<"all" | AppCategory>("all");
  const [composerDraft, setComposerDraft] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [isSavingArtifact, setIsSavingArtifact] = useState(false);
  const [isLaunchingApp, setIsLaunchingApp] = useState(false);
  const [isDecidingApproval, setIsDecidingApproval] = useState(false);
  const [isPublishingRoom, setIsPublishingRoom] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmittingPanel, setIsSubmittingPanel] = useState(false);
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [loginForm, setLoginForm] = useState({
    email: "founder@vxv.network",
    password: "vxv-demo",
  });
  const [isAuthenticating, setIsAuthenticating] = useState(false);
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
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [agentForm, setAgentForm] = useState({
    budget: "",
    permissions: "",
    escalation_rule: "",
  });
  const [workflowNote, setWorkflowNote] = useState("");
  const [investorForm, setInvestorForm] = useState({
    name: "",
    thesis: "",
    stage_fit: "Seed",
    relationship_status: "New",
    next_step: "",
  });
  const [investorDrafts, setInvestorDrafts] = useState<
    Record<string, { relationship_status: string; next_step: string }>
  >({});
  const [contactForm, setContactForm] = useState({
    name: "",
    category: "Advisor",
    company: "",
    relationship_stage: "New",
    last_touch: "",
  });
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const session = await fetchSession();
        setAuthSession(session);
        const bootstrap = await fetchBootstrap();
        setData(bootstrap);
        const initialArtifact =
          bootstrap.artifacts.find((artifact) => artifact.module === "strategy") ??
          bootstrap.artifacts[0];
        if (initialArtifact) {
          setSelectedArtifactId(initialArtifact.id);
          setArtifactDraft(initialArtifact.content);
        }
        const initialApp = bootstrap.apps.find((app) => app.featured) ?? bootstrap.apps[0];
        if (initialApp) {
          setSelectedAppId(initialApp.id);
        }
        setWorkspaceForm({
          company_name: bootstrap.workspace.company_name,
          founder_name: bootstrap.workspace.founder_name,
          stage: bootstrap.workspace.stage,
          mission: bootstrap.workspace.mission,
          primary_kpi: bootstrap.workspace.primary_kpi,
          summary: bootstrap.workspace.summary,
        });
        const initialAgent = bootstrap.agents[0];
        if (initialAgent) {
          setSelectedAgentId(initialAgent.id);
          setAgentForm({
            budget: initialAgent.budget,
            permissions: initialAgent.permissions.join(", "),
            escalation_rule: initialAgent.escalation_rule,
          });
        }
      } catch (loadError) {
        clearAuthToken();
        setAuthSession(null);
        setError(loadError instanceof Error ? loadError.message : null);
      } finally {
        setIsLoading(false);
      }
    };

    void load();
  }, []);

  const selectedArtifact = useMemo(
    () => data?.artifacts.find((artifact) => artifact.id === selectedArtifactId),
    [data?.artifacts, selectedArtifactId],
  );

  const selectedApp = useMemo(
    () => data?.apps.find((app) => app.id === selectedAppId) ?? data?.apps[0],
    [data?.apps, selectedAppId],
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
    () => data?.agents.find((agent) => agent.id === selectedAgentId) ?? data?.agents[0],
    [data?.agents, selectedAgentId],
  );

  const strategyWorkflows = useMemo(
    () => data?.workflows.filter((workflow) => workflow.module === "strategy") ?? [],
    [data?.workflows],
  );

  const executionWorkflows = useMemo(
    () => data?.workflows.filter((workflow) => workflow.module === "execution") ?? [],
    [data?.workflows],
  );

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
  }, [data?.workspace]);

  useEffect(() => {
    if (!data) {
      return;
    }
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
  }, [data?.fundraise_pipeline.investors]);

  useEffect(() => {
    if (!selectedAgent) {
      return;
    }
    setAgentForm({
      budget: selectedAgent.budget,
      permissions: selectedAgent.permissions.join(", "),
      escalation_rule: selectedAgent.escalation_rule,
    });
  }, [selectedAgent]);

  useEffect(() => {
    if (selectedArtifact) {
      setArtifactDraft(selectedArtifact.content);
    }
  }, [selectedArtifact]);

  useEffect(() => {
    if (!actionNotice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setActionNotice(null), 3000);
    return () => window.clearTimeout(timeout);
  }, [actionNotice]);

  useEffect(() => {
    if (!data) {
      return;
    }

    let nextArtifact: Artifact | undefined;

    if (activeModule === "capital" && capitalSurface === "investor-room") {
      nextArtifact = data.artifacts.find((artifact) =>
        data.investor_room.curated_artifact_ids.includes(artifact.id),
      );
    } else if (activeModule === "apps") {
      nextArtifact = data.artifacts.find((artifact) => artifact.module === "apps");
    } else {
      nextArtifact = data.artifacts.find((artifact) => artifact.module === activeModule);
    }

    if (nextArtifact) {
      setSelectedArtifactId(nextArtifact.id);
    }
  }, [activeModule, capitalSurface, data]);

  const moduleMessages = useMemo(() => {
    if (!data) {
      return [];
    }
    const messages = data.messages.filter((message) => message.module === activeModule);
    return messages.length > 0 ? messages : data.messages.slice(-3);
  }, [activeModule, data]);

  const filteredArtifacts = useMemo(() => {
    if (!data) {
      return [];
    }
    if (activeModule === "capital" && capitalSurface === "investor-room") {
      return data.artifacts.filter((artifact) =>
        data.investor_room.curated_artifact_ids.includes(artifact.id),
      );
    }
    if (activeModule === "apps") {
      return data.artifacts.filter((artifact) => artifact.module === "apps");
    }
    return data.artifacts.filter((artifact) => artifact.module === activeModule);
  }, [activeModule, capitalSurface, data]);

  const filteredRuns = useMemo(() => {
    if (!data) {
      return [];
    }
    if (activeModule === "apps") {
      return data.task_runs.filter(
        (task) =>
          task.module === "apps" ||
          (selectedApp ? task.title.toLowerCase().includes(selectedApp.title.toLowerCase()) : false),
      );
    }
    return data.task_runs.filter((task) => task.module === activeModule);
  }, [activeModule, data, selectedApp]);

  const approvalRuns = useMemo(
    () => data?.task_runs.filter((task) => task.requires_approval) ?? [],
    [data?.task_runs],
  );

  const filteredApps = useMemo(() => {
    if (!data) {
      return [];
    }
    return data.apps.filter((app) => appCategoryFilter === "all" || app.category === appCategoryFilter);
  }, [appCategoryFilter, data]);

  const mergeActionUpdate = (taskId: string, artifact?: Artifact | null) => {
    setData((current) => {
      if (!current) {
        return current;
      }

      const updatedTask = current.task_runs.find((task) => task.id === taskId);
      const nextArtifacts =
        artifact == null
          ? current.artifacts
          : [artifact, ...current.artifacts.filter((item) => item.id !== artifact.id)];

      return {
        ...current,
        artifacts: nextArtifacts,
        task_runs: updatedTask
          ? [updatedTask, ...current.task_runs.filter((task) => task.id !== taskId)]
          : current.task_runs,
      };
    });
  };

  const reloadWorkspace = async (options?: {
    preferredModule?: ModuleKey;
    preferredArtifactId?: string;
    preferredAppId?: string;
  }) => {
    const bootstrap = await fetchBootstrap();
    setData(bootstrap);

    const nextArtifactId =
      options?.preferredArtifactId && bootstrap.artifacts.some((artifact) => artifact.id === options.preferredArtifactId)
        ? options.preferredArtifactId
        : selectedArtifactId && bootstrap.artifacts.some((artifact) => artifact.id === selectedArtifactId)
          ? selectedArtifactId
          : bootstrap.artifacts[0]?.id ?? "";
    setSelectedArtifactId(nextArtifactId);
    const nextArtifact = bootstrap.artifacts.find((artifact) => artifact.id === nextArtifactId);
    if (nextArtifact) {
      setArtifactDraft(nextArtifact.content);
    }

    const nextAppId =
      options?.preferredAppId && bootstrap.apps.some((app) => app.id === options.preferredAppId)
        ? options.preferredAppId
        : selectedAppId && bootstrap.apps.some((app) => app.id === selectedAppId)
          ? selectedAppId
          : bootstrap.apps[0]?.id ?? "";
    setSelectedAppId(nextAppId);

    if (options?.preferredModule) {
      setActiveModule(options.preferredModule);
    }
  };

  const handleLogin = async () => {
    try {
      setIsAuthenticating(true);
      setError(null);
      const session = await login(loginForm.email, loginForm.password);
      setAuthToken(session.token);
      setAuthSession(session);
      await reloadWorkspace();
    } catch (authError) {
      setError(authError instanceof Error ? authError.message : "Unable to log in");
    } finally {
      setIsAuthenticating(false);
      setIsLoading(false);
    }
  };

  const handleSendMessage = async (message: string) => {
    if (!data) {
      return;
    }

    try {
      setIsSending(true);
      const response = await sendFounderMessage({
        module: activeModule,
        message,
        selected_artifact_id: selectedArtifactId || undefined,
      });

      setData((current) => {
        if (!current) {
          return current;
        }

        const nextArtifacts = [
          response.artifact,
          ...current.artifacts.filter((artifact) => artifact.id !== response.artifact.id),
        ];

        const nextMessages: ChatMessage[] = [
          ...current.messages,
          {
            id: `temp-user-${Date.now()}`,
            role: "user",
            author: "Founder",
            module: activeModule,
            content: message,
            created_at: new Date().toISOString(),
          },
          response.reply,
        ];

        return {
          ...current,
          artifacts: nextArtifacts,
          task_runs: [response.task_run, ...current.task_runs],
          messages: nextMessages,
          metrics: response.updated_metrics,
        };
      });

      setSelectedArtifactId(response.artifact.id);
      setArtifactDraft(response.artifact.content);
      setActionNotice(`Updated ${response.artifact.title}`);
      if (activeModule === "apps") {
        setAppSurface("run");
      }
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Unable to send message");
    } finally {
      setIsSending(false);
    }
  };

  const handleLaunchCard = (module: ModuleKey, prompt: string) => {
    setActiveModule(module);
    setComposerDraft(prompt);

    if (module === "capital") {
      setCapitalSurface("workspace");
    }

    if (module === "apps") {
      setAppSurface("run");
    }
  };

  const handleSaveArtifact = async () => {
    if (!selectedArtifact) {
      return;
    }

    try {
      setIsSavingArtifact(true);
      const artifact = await saveArtifact(selectedArtifact.id, artifactDraft);
      setData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          artifacts: current.artifacts.map((item) =>
            item.id === artifact.id ? artifact : item,
          ),
        };
      });
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
      setData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          task_runs: current.task_runs.map((item) =>
            item.id === response.task_run.id ? response.task_run : item,
          ),
        };
      });
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
        composerDraft.trim() || `Run ${selectedApp.title} on the latest workspace materials.`,
      );
      setData((current) => {
        if (!current) {
          return current;
        }
        return {
          ...current,
          artifacts: response.artifact
            ? [response.artifact, ...current.artifacts.filter((item) => item.id !== response.artifact?.id)]
            : current.artifacts,
          task_runs: [response.task_run, ...current.task_runs.filter((task) => task.id !== response.task_run.id)],
          apps: current.apps.map((app) =>
            app.id === selectedApp.id
              ? { ...app, last_run_at: response.task_run.created_at }
              : app,
          ),
        };
      });
      if (response.artifact) {
        setSelectedArtifactId(response.artifact.id);
        setArtifactDraft(response.artifact.content);
      }
      setAppSurface("run");
      setComposerDraft("");
      setActionNotice(response.message);
    } catch (launchError) {
      setError(launchError instanceof Error ? launchError.message : "Unable to launch app");
    } finally {
      setIsLaunchingApp(false);
    }
  };

  const handlePublishInvestorRoom = async () => {
    if (!data) {
      return;
    }

    try {
      setIsPublishingRoom(true);
      const response = await publishInvestorRoom(selectedArtifact?.id);
      setData((current) => {
        if (!current) {
          return current;
        }

        return {
          ...current,
          investor_room: response.investor_room,
        };
      });
      setActiveModule("capital");
      setCapitalSurface("investor-room");
      setActionNotice(response.message);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "Unable to publish investor room");
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
      const response = await uploadDocument(
        uploadFile,
        activeModule === "apps" ? "apps" : activeModule,
        uploadTitle || uploadFile.name,
      );
      await reloadWorkspace({
        preferredModule: activeModule === "inbox" ? "artifacts" : activeModule,
        preferredArtifactId: response.artifact.id,
      });
      setSelectedArtifactId(response.artifact.id);
      setArtifactDraft(response.artifact.content);
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
      await reloadWorkspace();
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
      await reloadWorkspace({ preferredModule: "strategy" });
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
      await reloadWorkspace({ preferredModule: "strategy" });
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
      await reloadWorkspace({ preferredModule: "strategy" });
      setKnowledgeForm({
        title: "",
        source_type: "doc",
        status: "Connected",
        freshness: "Today",
      });
      setActionNotice("Knowledge source connected.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add knowledge source");
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
      await reloadWorkspace({ preferredModule: "team" });
      setActionNotice(`${selectedAgent.name} updated.`);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to update agent");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleLaunchWorkflow = async (workflowId: string, module: ModuleKey) => {
    try {
      setIsSubmittingPanel(true);
      const response = await launchWorkflow(
        workflowId,
        workflowNote.trim() || "Use the current workspace context and produce a founder-ready output.",
      );
      await reloadWorkspace({
        preferredModule: module,
        preferredArtifactId: response.artifact?.id,
      });
      setWorkflowNote("");
      setSelectedArtifactId(response.artifact?.id ?? selectedArtifactId);
      if (response.artifact) {
        setArtifactDraft(response.artifact.content);
      }
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
      await reloadWorkspace({ preferredModule: "capital" });
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

  const handleInvestorUpdate = async (
    investorId: string,
    relationshipStatus: string,
    nextStep: string,
  ) => {
    try {
      setIsSubmittingPanel(true);
      await updateFundraiseInvestor(investorId, {
        relationship_status: relationshipStatus,
        next_step: nextStep,
      });
      await reloadWorkspace({ preferredModule: "capital" });
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
      await reloadWorkspace({ preferredModule: "capital" });
      setContactForm({
        name: "",
        category: "Advisor",
        company: "",
        relationship_stage: "New",
        last_touch: "",
      });
      setActionNotice("Relationship added to workspace.");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to add relationship");
    } finally {
      setIsSubmittingPanel(false);
    }
  };

  const handleModuleSelect = (module: ModuleKey) => {
    setActiveModule(module);
    if (module !== "capital") {
      setCapitalSurface("workspace");
    }
    if (module !== "apps") {
      setAppSurface("library");
    }
  };

  const activeAgent = useMemo(() => {
    if (!data) {
      return undefined;
    }
    return filteredRuns[0]
      ? data.agents.find((agent) => agent.id === filteredRuns[0].owner_agent_id)
      : data.agents[0];
  }, [data, filteredRuns]);

  if (isLoading) {
    return <div className="app-state">Loading VXV Workspace...</div>;
  }

  if (!authSession) {
    return (
      <div className="login-shell">
        <section className="login-card">
          <p className="section-kicker">Founder access</p>
          <h1>Log into VXV Workspace</h1>
          <p>
            Sign into the founder workspace to load your operating context, runs,
            artifacts, and capital pipeline.
          </p>
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

  if (error || !data) {
    return (
      <div className="app-state">
        <p>Unable to load the founder workspace.</p>
        {error ? <code>{error}</code> : null}
      </div>
    );
  }

  const activeModuleMeta = moduleMeta[activeModule];

  return (
      <div className="vxv-shell">
        <aside className="workspace-nav">
          <div className="brand-stack">
            <div className="brand-mark">VXV Workspace</div>
            <div className="brand-subtitle">Founder operating system</div>
          </div>

          <nav className="primary-nav" aria-label="Workspace modules">
            {moduleOrder.map((module) => (
              <button
                key={module}
                className={`nav-item ${activeModule === module ? "active" : ""}`}
                onClick={() => handleModuleSelect(module)}
                type="button"
              >
                <span>{moduleMeta[module].label}</span>
                <small>{moduleMeta[module].statLabel}</small>
              </button>
            ))}
          </nav>

          <div className="workspace-nav-footer">
            <button className="secondary-nav-button" type="button">
              Settings
            </button>
            <button className="secondary-nav-button" type="button">
              Support
            </button>
            <div className="founder-chip">
              <div className="founder-avatar">MG</div>
              <div>
                <strong>{data.workspace.founder_name}</strong>
                <p>{data.workspace.stage}</p>
              </div>
            </div>
          </div>
        </aside>

        <div className="workspace-main">
          <header className="topbar">
            <div>
              <p className="section-kicker">{activeModuleMeta.kicker}</p>
              <h1>{activeModuleMeta.label}</h1>
              <p className="section-copy">{activeModuleMeta.description}</p>
              {actionNotice ? <p className="action-notice">{actionNotice}</p> : null}
              {error ? <p className="action-error">{error}</p> : null}
            </div>
            <div className="topbar-actions">
              <div className="topbar-search">Command + K</div>
              <div className="topbar-pill">{data.integrations.mode}</div>
              <div className="topbar-pill">{authSession.display_name}</div>
              {data.integrations.runtime_provider ? (
                <div className="topbar-pill">{data.integrations.runtime_provider}</div>
              ) : null}
              <button
                className="primary-action"
                disabled={isPublishingRoom}
                onClick={() => void handlePublishInvestorRoom()}
                type="button"
              >
                {isPublishingRoom ? "Publishing..." : "Publish investor room"}
              </button>
            </div>
          </header>

          <div className="content-layout">
            <main className="content-pane">
              {activeModule === "inbox" && (
                <>
                  <section className="hero-panel">
                    <div>
                      <p className="section-kicker">Onboarding</p>
                      <h2>Let&apos;s set up your founder workspace.</h2>
                      <p>
                        VXV is built for operational clarity. Configure your core
                        systems, launch the right agent team, and turn strategy into
                        live execution without leaving the workspace.
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

                  <section className="card-grid card-grid-four">
                    {founderLaunchCards.map((card) => (
                      <article key={card.title} className="surface-card action-card">
                        <p className="card-tag">Action</p>
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
                  </section>

                  <section className="two-column">
                    <article className="surface-card">
                      <div className="panel-header">
                        <div>
                          <p className="section-kicker">Founder command deck</p>
                          <h3>Inbox and steering loop</h3>
                        </div>
                      </div>
                      <div className="conversation-thread">
                        {moduleMessages.map((message) => (
                          <article
                            key={message.id}
                            className={`message-bubble ${message.role === "assistant" ? "assistant" : "user"}`}
                          >
                            <div className="message-meta">
                              <strong>{message.author}</strong>
                              <span>{formatTimestamp(message.created_at)}</span>
                            </div>
                            {message.role === "assistant" ? (
                              <Markdown content={message.content} />
                            ) : (
                              <p>{message.content}</p>
                            )}
                          </article>
                        ))}
                      </div>
                      <div className="prompt-row">
                        {defaultSuggestions.inbox.map((suggestion) => (
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
                          placeholder="Ask for an operating plan, investor memo, weekly review, app run, or delegation..."
                          rows={4}
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
                    </article>

                    <div className="stack-column">
                      <article className="surface-card">
                        <div className="panel-header">
                          <div>
                            <p className="section-kicker">Workspace setup</p>
                            <h3>Founder operating context</h3>
                          </div>
                        </div>
                        <div className="form-grid">
                          <label className="field">
                            <span>Company</span>
                            <input
                              value={workspaceForm.company_name}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  company_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Founder</span>
                            <input
                              value={workspaceForm.founder_name}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  founder_name: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Stage</span>
                            <input
                              value={workspaceForm.stage}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  stage: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field">
                            <span>Primary KPI</span>
                            <input
                              value={workspaceForm.primary_kpi}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  primary_kpi: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field field-full">
                            <span>Mission</span>
                            <textarea
                              rows={3}
                              value={workspaceForm.mission}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  mission: event.target.value,
                                }))
                              }
                            />
                          </label>
                          <label className="field field-full">
                            <span>Summary</span>
                            <textarea
                              rows={3}
                              value={workspaceForm.summary}
                              onChange={(event) =>
                                setWorkspaceForm((current) => ({
                                  ...current,
                                  summary: event.target.value,
                                }))
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

                      <article className="surface-card approval-card">
                        <div className="panel-header">
                          <div>
                            <p className="section-kicker">Approval required</p>
                            <h3>
                              {approvalRuns[0]?.title ?? "No approvals waiting right now"}
                            </h3>
                          </div>
                          <span className="status-pill warning">
                            {approvalRuns.length} pending
                          </span>
                        </div>
                        <p>
                          {approvalRuns[0]?.trace_summary ??
                            "The workspace will surface risky actions here before anything external is sent."}
                        </p>
                        <div className="detail-grid">
                          <div>
                            <span>Responsible agent</span>
                            <strong>
                              {approvalRuns[0]
                                ? data.agents.find((agent) => agent.id === approvalRuns[0].owner_agent_id)?.name
                                : "ChiefOfStaffAgent"}
                            </strong>
                          </div>
                          <div>
                            <span>Business context</span>
                            <strong>{approvalRuns[0]?.progress_label ?? "Waiting on setup"}</strong>
                          </div>
                        </div>
                        <div className="button-row">
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
                      </article>

                      <article className="surface-card">
                        <div className="panel-header">
                          <div>
                            <p className="section-kicker">Live runs</p>
                            <h3>Execution trace</h3>
                          </div>
                        </div>
                        <div className="run-list">
                          {data.task_runs.slice(0, 4).map((task) => (
                            <div key={task.id} className="run-row">
                              <div className={`status-dot ${task.status}`} />
                              <div>
                                <strong>{task.title}</strong>
                                <p>{task.trace_summary}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </article>
                    </div>
                  </section>
                </>
              )}

              {activeModule === "strategy" && (
                <>
                  <section className="hero-panel compact">
                    <div>
                      <p className="section-kicker">Founder cockpit</p>
                      <h2>Strategy stays connected to research, goals, and the next operating move.</h2>
                      <p>
                        This is where the founder clarifies the wedge, maps the market,
                        and turns ambiguity into a plan the rest of the workspace can execute.
                      </p>
                    </div>
                  </section>

                  <section className="card-grid card-grid-three">
                    <article className="surface-card">
                      <p className="section-kicker">Strategic goals</p>
                      <h3>Active priorities</h3>
                      <div className="list-stack">
                        {data.goals.map((goal) => (
                          <div key={goal.id} className="list-row">
                            <div>
                              <strong>{goal.title}</strong>
                              <p>{goal.kpi}</p>
                            </div>
                            <div className="list-side">
                              <select
                                className="inline-select"
                                value={goal.status}
                                onChange={(event) =>
                                  void handleGoalStatusChange(goal.id, event.target.value)
                                }
                              >
                                {["Planned", "Ready", "In flight", "Planning", "Done"].map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="surface-card">
                      <p className="section-kicker">Knowledge context</p>
                      <h3>Connected sources</h3>
                      <div className="list-stack">
                        {data.knowledge_sources.map((source) => (
                          <div key={source.id} className="list-row">
                            <div>
                              <strong>{source.title}</strong>
                              <p>{source.source_type}</p>
                            </div>
                            <span className="status-pill muted">{source.freshness}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                    <article className="surface-card">
                      <p className="section-kicker">Suggested workflows</p>
                      <h3>Next best moves</h3>
                      <div className="list-stack">
                        {data.workflows
                          .filter((workflow) => workflow.module === "strategy")
                          .map((workflow) => (
                            <div key={workflow.id} className="workflow-row">
                              <strong>{workflow.title}</strong>
                              <p>{workflow.description}</p>
                              <small>{workflow.outputs.join(" · ")}</small>
                              <button
                                className="inline-link"
                                onClick={() => void handleLaunchWorkflow(workflow.id, workflow.module)}
                                type="button"
                              >
                                Launch workflow
                              </button>
                            </div>
                          ))}
                      </div>
                    </article>
                  </section>

                  <section className="two-column">
                    <article className="surface-card">
                      <p className="section-kicker">Add strategic goal</p>
                      <div className="form-grid">
                        <label className="field field-full">
                          <span>Goal title</span>
                          <input
                            value={goalForm.title}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, title: event.target.value }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Owner</span>
                          <input
                            value={goalForm.owner}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, owner: event.target.value }))
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
                        <label className="field">
                          <span>Status</span>
                          <select
                            value={goalForm.status}
                            onChange={(event) =>
                              setGoalForm((current) => ({ ...current, status: event.target.value }))
                            }
                          >
                            {["Planned", "Ready", "In flight", "Planning"].map((status) => (
                              <option key={status} value={status}>
                                {status}
                              </option>
                            ))}
                          </select>
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          className="primary-action"
                          disabled={isSubmittingPanel || !goalForm.title || !goalForm.kpi}
                          onClick={() => void handleCreateGoal()}
                          type="button"
                        >
                          {isSubmittingPanel ? "Saving..." : "Add goal"}
                        </button>
                      </div>
                    </article>

                    <article className="surface-card">
                      <p className="section-kicker">Connect knowledge</p>
                      <div className="form-grid">
                        <label className="field field-full">
                          <span>Source title</span>
                          <input
                            value={knowledgeForm.title}
                            onChange={(event) =>
                              setKnowledgeForm((current) => ({ ...current, title: event.target.value }))
                            }
                          />
                        </label>
                        <label className="field">
                          <span>Source type</span>
                          <select
                            value={knowledgeForm.source_type}
                            onChange={(event) =>
                              setKnowledgeForm((current) => ({ ...current, source_type: event.target.value }))
                            }
                          >
                            {["doc", "notes", "crm", "drive", "transcript"].map((value) => (
                              <option key={value} value={value}>
                                {value}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="field">
                          <span>Freshness</span>
                          <input
                            value={knowledgeForm.freshness}
                            onChange={(event) =>
                              setKnowledgeForm((current) => ({ ...current, freshness: event.target.value }))
                            }
                          />
                        </label>
                      </div>
                      <div className="button-row">
                        <button
                          className="primary-action"
                          disabled={isSubmittingPanel || !knowledgeForm.title}
                          onClick={() => void handleAddKnowledgeSource()}
                          type="button"
                        >
                          {isSubmittingPanel ? "Saving..." : "Add source"}
                        </button>
                      </div>
                    </article>
                  </section>
                </>
              )}

              {activeModule === "team" && (
                <>
                  <section className="hero-panel compact">
                    <div>
                      <p className="section-kicker">AI team delegation</p>
                      <h2>Staff the workspace like a real operating team.</h2>
                      <p>
                        Every agent has a scope, budget, toolset, and escalation rule so
                        the founder can delegate with confidence instead of mystery.
                      </p>
                    </div>
                  </section>

                  <section className="card-grid card-grid-two">
                    {data.agents.map((agent) => (
                      <article key={agent.id} className="surface-card agent-card">
                        <div className="panel-header">
                          <div>
                            <p className="section-kicker">{moduleMeta[agent.module].label}</p>
                            <h3>{agent.name}</h3>
                          </div>
                          <span className="status-pill">{agent.budget}</span>
                        </div>
                        <p>{agent.role}</p>
                        <div className="tag-strip">
                          {agent.tools.map((tool) => (
                            <span key={tool} className="tag-chip">
                              {tool}
                            </span>
                          ))}
                        </div>
                        <div className="detail-grid">
                          <div>
                            <span>Permissions</span>
                            <strong>{agent.permissions.join(", ")}</strong>
                          </div>
                          <div>
                            <span>Escalation</span>
                            <strong>{agent.escalation_rule}</strong>
                          </div>
                        </div>
                      </article>
                    ))}
                  </section>

                  <section className="surface-card">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Agent controls</p>
                        <h3>Guardrails and budgets</h3>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label className="field">
                        <span>Agent</span>
                        <select
                          value={selectedAgent?.id ?? ""}
                          onChange={(event) => setSelectedAgentId(event.target.value)}
                        >
                          {data.agents.map((agent) => (
                            <option key={agent.id} value={agent.id}>
                              {agent.name}
                            </option>
                          ))}
                        </select>
                      </label>
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
                            setAgentForm((current) => ({
                              ...current,
                              escalation_rule: event.target.value,
                            }))
                          }
                        />
                      </label>
                    </div>
                    <div className="button-row">
                      <button
                        className="primary-action"
                        disabled={isSubmittingPanel || !selectedAgent}
                        onClick={() => void handleSaveAgent()}
                        type="button"
                      >
                        {isSubmittingPanel ? "Saving..." : "Save agent settings"}
                      </button>
                    </div>
                  </section>
                </>
              )}

              {activeModule === "execution" && (
                <>
                  <section className="hero-panel compact">
                    <div>
                      <p className="section-kicker">Operating cadence</p>
                      <h2>Turn planning into repeatable founder rhythms.</h2>
                      <p>
                        Weekly reviews, approvals, and execution loops stay visible here
                        so runs survive context switching and don&apos;t disappear into chat.
                      </p>
                    </div>
                  </section>

                  <section className="two-column">
                    <article className="surface-card">
                      <p className="section-kicker">Live operating runs</p>
                      <h3>What is in motion</h3>
                      <div className="run-list">
                        {data.task_runs
                          .filter((task) => task.module === "execution")
                          .map((task) => (
                            <div key={task.id} className="run-card">
                              <div className="panel-header">
                                <strong>{task.title}</strong>
                                <span className={`status-pill ${task.status}`}>
                                  {task.status}
                                </span>
                              </div>
                              <p>{task.trace_summary}</p>
                              <small>{task.progress_label}</small>
                            </div>
                          ))}
                      </div>
                    </article>
                    <article className="surface-card">
                      <p className="section-kicker">Execution workflows</p>
                      <h3>Cadence builders</h3>
                      <div className="list-stack">
                        {data.workflows
                          .filter((workflow) => workflow.module === "execution")
                          .map((workflow) => (
                            <div key={workflow.id} className="workflow-row">
                              <strong>{workflow.title}</strong>
                              <p>{workflow.description}</p>
                              <small>{workflow.outputs.join(" · ")}</small>
                              <button
                                className="inline-link"
                                onClick={() => void handleLaunchWorkflow(workflow.id, workflow.module)}
                                type="button"
                              >
                                Launch workflow
                              </button>
                            </div>
                          ))}
                      </div>
                    </article>
                  </section>

                  <section className="surface-card">
                    <div className="panel-header">
                      <div>
                        <p className="section-kicker">Workflow runner</p>
                        <h3>Launch the next cadence with context</h3>
                      </div>
                    </div>
                    <textarea
                      className="composer-input"
                      rows={4}
                      placeholder="Add a note for the next workflow run..."
                      value={workflowNote}
                      onChange={(event) => setWorkflowNote(event.target.value)}
                    />
                    <div className="button-row">
                      {executionWorkflows.map((workflow) => (
                        <button
                          key={workflow.id}
                          className="ghost-action"
                          disabled={isSubmittingPanel}
                          onClick={() => void handleLaunchWorkflow(workflow.id, workflow.module)}
                          type="button"
                        >
                          {workflow.title}
                        </button>
                      ))}
                    </div>
                  </section>
                </>
              )}

              {activeModule === "artifacts" && (
                <>
                  <section className="hero-panel compact">
                    <div>
                      <p className="section-kicker">Company memory</p>
                      <h2>Every important output should be editable, linked, and publishable.</h2>
                      <p>
                        Artifacts are the durable layer of the workspace: briefs, memos,
                        plans, and investor updates that inherit traceability from the runs that made them.
                      </p>
                    </div>
                  </section>

                  <section className="artifact-layout">
                    <article className="surface-card">
                      <div className="panel-header">
                        <div>
                          <p className="section-kicker">Artifacts</p>
                          <h3>Workspace outputs</h3>
                        </div>
                      </div>
                      <div className="artifact-list">
                        {data.artifacts.map((artifact) => (
                          <button
                            key={artifact.id}
                            className={`artifact-list-item ${artifact.id === selectedArtifact?.id ? "active" : ""}`}
                            onClick={() => setSelectedArtifactId(artifact.id)}
                            type="button"
                          >
                            <div>
                              <strong>{artifact.title}</strong>
                              <p>{artifact.summary}</p>
                            </div>
                            <span className="status-pill muted">{artifact.kind}</span>
                          </button>
                        ))}
                      </div>
                    </article>

                    <article className="surface-card">
                      <div className="panel-header">
                        <div>
                          <p className="section-kicker">Artifact detail</p>
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

                      {selectedArtifact ? (
                        artifactView === "preview" ? (
                          <div className="artifact-markdown">
                            <Markdown content={artifactDraft} />
                          </div>
                        ) : (
                          <textarea
                            className="artifact-editor"
                            value={artifactDraft}
                            onChange={(event) => {
                              setArtifactDraft(event.target.value);
                              setData((current) => {
                                if (!current || !selectedArtifact) {
                                  return current;
                                }
                                return {
                                  ...current,
                                  artifacts: current.artifacts.map((artifact) =>
                                    artifact.id === selectedArtifact.id
                                      ? { ...artifact, content: event.target.value }
                                      : artifact,
                                  ),
                                };
                              });
                            }}
                          />
                        )
                      ) : null}

                      {selectedArtifact && artifactView === "edit" ? (
                        <div className="button-row">
                          <button
                            className="primary-action"
                            disabled={isSavingArtifact}
                            onClick={() => void handleSaveArtifact()}
                            type="button"
                          >
                            {isSavingArtifact ? "Saving..." : "Save artifact"}
                          </button>
                        </div>
                      ) : null}
                    </article>
                  </section>
                </>
              )}

              {activeModule === "capital" && (
                <>
                  <section className="subnav-row">
                    <button
                      className={capitalSurface === "workspace" ? "active" : ""}
                      onClick={() => setCapitalSurface("workspace")}
                      type="button"
                    >
                      Fundraising Workspace
                    </button>
                    <button
                      className={capitalSurface === "investor-room" ? "active" : ""}
                      onClick={() => setCapitalSurface("investor-room")}
                      type="button"
                    >
                      Investor Room
                    </button>
                  </section>

                  {capitalSurface === "workspace" ? (
                    <>
                      <section className="hero-panel compact">
                        <div>
                          <p className="section-kicker">Capital module</p>
                          <h2>Keep fundraising inside the same operating system as everything else.</h2>
                          <p>
                            Internal prep, investor relationships, diligence readiness,
                            and investor-facing publishing all run through one capital surface.
                          </p>
                        </div>
                        <div className="hero-metrics">
                          <div className="metric-card">
                            <span>Round</span>
                            <strong>{data.fundraise_pipeline.round_name}</strong>
                          </div>
                          <div className="metric-card">
                            <span>Target</span>
                            <strong>{data.fundraise_pipeline.target_amount}</strong>
                          </div>
                          <div className="metric-card">
                            <span>Status</span>
                            <strong>{data.fundraise_pipeline.status}</strong>
                          </div>
                        </div>
                      </section>

                      <section className="two-column">
                        <article className="surface-card">
                          <p className="section-kicker">Round narrative</p>
                          <h3>{data.fundraise_pipeline.round_name}</h3>
                          <p>{data.fundraise_pipeline.narrative}</p>
                          <div className="button-row">
                            <button
                              className="primary-action"
                              disabled={isPublishingRoom}
                              onClick={() => void handlePublishInvestorRoom()}
                              type="button"
                            >
                              {isPublishingRoom ? "Publishing..." : "Publish to investor room"}
                            </button>
                            <button className="ghost-action" type="button">
                              Refresh memo
                            </button>
                          </div>
                        </article>
                        <article className="surface-card">
                          <p className="section-kicker">Investor pipeline</p>
                          <h3>Relationship status</h3>
                          <div className="list-stack">
                            {data.fundraise_pipeline.investors.map((investor) => (
                              <div key={investor.id} className="list-row">
                                <div>
                                  <strong>{investor.name}</strong>
                                  <p>{investor.thesis}</p>
                                </div>
                                <div className="list-side">
                                  <select
                                    className="inline-select"
                                    value={
                                      investorDrafts[investor.id]?.relationship_status ??
                                      investor.relationship_status
                                    }
                                    onChange={(event) =>
                                      setInvestorDrafts((current) => ({
                                        ...current,
                                        [investor.id]: {
                                          relationship_status: event.target.value,
                                          next_step:
                                            current[investor.id]?.next_step ?? investor.next_step,
                                        },
                                      }))
                                    }
                                  >
                                    {["New", "Researching", "Warm", "Active", "Meeting", "Closed"].map((status) => (
                                      <option key={status} value={status}>
                                        {status}
                                      </option>
                                    ))}
                                  </select>
                                  <input
                                    value={investorDrafts[investor.id]?.next_step ?? investor.next_step}
                                    onChange={(event) =>
                                      setInvestorDrafts((current) => ({
                                        ...current,
                                        [investor.id]: {
                                          relationship_status:
                                            current[investor.id]?.relationship_status ??
                                            investor.relationship_status,
                                          next_step: event.target.value,
                                        },
                                      }))
                                    }
                                  />
                                  <button
                                    className="inline-link"
                                    onClick={() =>
                                      void handleInvestorUpdate(
                                        investor.id,
                                        investorDrafts[investor.id]?.relationship_status ??
                                          investor.relationship_status,
                                        investorDrafts[investor.id]?.next_step ?? investor.next_step,
                                      )
                                    }
                                    type="button"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ))}
                          </div>
                        </article>
                      </section>

                      <section className="two-column">
                        <article className="surface-card">
                          <p className="section-kicker">Add investor</p>
                          <div className="form-grid">
                            <label className="field">
                              <span>Name</span>
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
                              <input
                                value={investorForm.thesis}
                                onChange={(event) =>
                                  setInvestorForm((current) => ({ ...current, thesis: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Relationship</span>
                              <select
                                value={investorForm.relationship_status}
                                onChange={(event) =>
                                  setInvestorForm((current) => ({
                                    ...current,
                                    relationship_status: event.target.value,
                                  }))
                                }
                              >
                                {["New", "Researching", "Warm", "Active", "Meeting"].map((status) => (
                                  <option key={status} value={status}>
                                    {status}
                                  </option>
                                ))}
                              </select>
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
                              disabled={isSubmittingPanel || !investorForm.name || !investorForm.next_step}
                              onClick={() => void handleCreateInvestor()}
                              type="button"
                            >
                              {isSubmittingPanel ? "Saving..." : "Add investor"}
                            </button>
                          </div>
                        </article>

                        <article className="surface-card">
                          <p className="section-kicker">Add relationship</p>
                          <div className="form-grid">
                            <label className="field">
                              <span>Name</span>
                              <input
                                value={contactForm.name}
                                onChange={(event) =>
                                  setContactForm((current) => ({ ...current, name: event.target.value }))
                                }
                              />
                            </label>
                            <label className="field">
                              <span>Category</span>
                              <select
                                value={contactForm.category}
                                onChange={(event) =>
                                  setContactForm((current) => ({ ...current, category: event.target.value }))
                                }
                              >
                                {["Advisor", "Investor", "Partner", "Customer"].map((value) => (
                                  <option key={value} value={value}>
                                    {value}
                                  </option>
                                ))}
                              </select>
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
                            <label className="field">
                              <span>Stage</span>
                              <input
                                value={contactForm.relationship_stage}
                                onChange={(event) =>
                                  setContactForm((current) => ({
                                    ...current,
                                    relationship_stage: event.target.value,
                                  }))
                                }
                              />
                            </label>
                          </div>
                          <div className="button-row">
                            <button
                              className="primary-action"
                              disabled={isSubmittingPanel || !contactForm.name || !contactForm.company}
                              onClick={() => void handleCreateContact()}
                              type="button"
                            >
                              {isSubmittingPanel ? "Saving..." : "Add relationship"}
                            </button>
                          </div>
                        </article>
                      </section>
                    </>
                  ) : (
                    <section className="investor-room">
                      <div className="investor-hero">
                        <div>
                          <p className="section-kicker">Secure access • read only</p>
                          <h2>Investor Room</h2>
                          <p>{data.investor_room.headline}</p>
                        </div>
                        <div className="investor-stats">
                          <div className="metric-card">
                            <span>Visibility</span>
                            <strong>{data.investor_room.visibility}</strong>
                          </div>
                          <div className="metric-card">
                            <span>Curated materials</span>
                            <strong>{data.investor_room.curated_artifact_ids.length}</strong>
                          </div>
                        </div>
                      </div>
                      <div className="two-column">
                        <article className="surface-card">
                          <p className="section-kicker">Curated materials</p>
                          <div className="list-stack">
                            {data.artifacts
                              .filter((artifact) =>
                                data.investor_room.curated_artifact_ids.includes(artifact.id),
                              )
                              .map((artifact) => (
                                <div key={artifact.id} className="list-row">
                                  <div>
                                    <strong>{artifact.title}</strong>
                                    <p>{artifact.summary}</p>
                                  </div>
                                  <span className="status-pill muted">{artifact.kind}</span>
                                </div>
                              ))}
                          </div>
                        </article>
                        <article className="surface-card">
                          <p className="section-kicker">Diligence checklist</p>
                          <div className="list-stack">
                            {data.investor_room.diligence_items.map((item) => (
                              <div key={item} className="list-row">
                                <strong>{item}</strong>
                                <span className="status-pill success">Ready</span>
                              </div>
                            ))}
                          </div>
                          <p className="section-kicker" style={{ marginTop: "1.25rem" }}>
                            Recent updates
                          </p>
                          <div className="timeline-list">
                            {data.investor_room.update_feed.map((item) => (
                              <div key={item} className="timeline-item">
                                <strong>{item}</strong>
                              </div>
                            ))}
                          </div>
                        </article>
                      </div>
                    </section>
                  )}
                </>
              )}

              {activeModule === "apps" && (
                <>
                  <section className="subnav-row">
                    <button
                      className={appSurface === "library" ? "active" : ""}
                      onClick={() => setAppSurface("library")}
                      type="button"
                    >
                      App Library
                    </button>
                    <button
                      className={appSurface === "run" ? "active" : ""}
                      onClick={() => setAppSurface("run")}
                      type="button"
                    >
                      App Run
                    </button>
                  </section>

                  {appSurface === "library" ? (
                    <>
                      <section className="hero-panel compact">
                        <div>
                          <p className="section-kicker">Workspace tools</p>
                          <h2>Launch focused workflow apps without leaving the workspace.</h2>
                          <p>
                            Apps use skills, create artifacts, and keep their run traces
                            inside the same operating layer as strategy, execution, and capital.
                          </p>
                        </div>
                      </section>

                      <section className="filter-row">
                        {(["all", "strategy", "growth", "operations", "fundraising", "hiring", "research"] as const).map(
                          (category) => (
                            <button
                              key={category}
                              className={appCategoryFilter === category ? "active" : ""}
                              onClick={() => setAppCategoryFilter(category)}
                              type="button"
                            >
                              {category === "all" ? "All" : categoryLabel(category)}
                            </button>
                          ),
                        )}
                      </section>

                      <section className="card-grid card-grid-three">
                        {filteredApps.map((app) => (
                          <article key={app.id} className="surface-card app-card">
                            <div className="panel-header">
                              <span className="status-pill muted">
                                {categoryLabel(app.category)}
                              </span>
                              <span className="status-pill">
                                {moduleMeta[app.module].label}
                              </span>
                            </div>
                            <h3>{app.title}</h3>
                            <p>{app.summary}</p>
                            <div className="app-meta">
                              <small>Uses {app.skill_ids.length} skills</small>
                              <small>Creates {app.artifact_outputs.length} artifacts</small>
                            </div>
                            <div className="tag-strip">
                              {app.artifact_outputs.map((output) => (
                                <span key={output} className="tag-chip">
                                  {output}
                                </span>
                              ))}
                            </div>
                            <div className="button-row">
                              <button
                                className="primary-action"
                                disabled={app.status !== "ready"}
                                onClick={() => {
                                  setSelectedAppId(app.id);
                                  setAppSurface("run");
                                  setActiveModule("apps");
                                }}
                                type="button"
                              >
                                {app.status === "ready" ? "Open app" : "Coming soon"}
                              </button>
                            </div>
                          </article>
                        ))}
                      </section>
                    </>
                  ) : (
                    <section className="app-run-layout">
                      <article className="surface-card app-run-main">
                        <div className="panel-header">
                          <div>
                            <p className="section-kicker">Specialized app</p>
                            <h2>{selectedApp?.title ?? "Select an app"}</h2>
                            <p>{selectedApp?.summary}</p>
                          </div>
                          <div className="button-row">
                            <button className="ghost-action" type="button">
                              Share
                            </button>
                            <button
                              className="primary-action"
                              disabled={isLaunchingApp}
                              onClick={() => void handleLaunchApp()}
                              type="button"
                            >
                              {isLaunchingApp ? "Starting..." : "Start review"}
                            </button>
                          </div>
                        </div>

                        <div className="app-run-grid">
                          <div className="surface-panel inset">
                            <p className="section-kicker">Input configuration</p>
                            <div className="upload-zone">
                              <strong>{uploadFile ? uploadFile.name : "Choose pitch deck or document"}</strong>
                              <p>Supports text and PDF today. Uploaded files become workspace memory.</p>
                              <label className="ghost-action upload-button">
                                <input
                                  hidden
                                  type="file"
                                  onChange={(event) => setUploadFile(event.target.files?.[0] ?? null)}
                                />
                                Select file
                              </label>
                            </div>
                            <input
                              className="composer-input upload-title"
                              placeholder="Optional upload title"
                              value={uploadTitle}
                              onChange={(event) => setUploadTitle(event.target.value)}
                            />
                            <textarea
                              aria-label="App prompt"
                              className="composer-input app-prompt"
                              placeholder="Add context for this run, such as the goal of the review or the audience for the output..."
                              rows={4}
                              value={composerDraft}
                              onChange={(event) => setComposerDraft(event.target.value)}
                            />
                            <div className="detail-grid">
                              <div>
                                <span>Stage selection</span>
                                <strong>Seed / Pre-seed</strong>
                              </div>
                              <div>
                                <span>Review strictness</span>
                                <strong>Adversarial</strong>
                              </div>
                            </div>
                            <div className="button-row">
                              <button
                                className="ghost-action"
                                disabled={!uploadFile || isUploading}
                                onClick={() => void handleUploadDocument()}
                                type="button"
                              >
                                {isUploading ? "Uploading..." : "Add to workspace memory"}
                              </button>
                            </div>
                          </div>

                          <div className="surface-panel inset">
                            <p className="section-kicker">Operational agents and skills</p>
                            <div className="list-stack">
                              {selectedAppSkills.map((skill) => (
                                <div key={skill.id} className="list-row">
                                  <div>
                                    <strong>{skill.name}</strong>
                                    <p>{skill.summary}</p>
                                  </div>
                                  <span className="status-pill muted">{skill.capability_type}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="surface-panel inset">
                            <p className="section-kicker">Live execution trace</p>
                            <div className="timeline-list">
                              {(filteredRuns.length > 0 ? filteredRuns : data.task_runs.slice(0, 3)).map((task) => (
                                <div key={task.id} className="timeline-item">
                                  <strong>{task.title}</strong>
                                  <p>{task.trace_summary}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="surface-panel inset">
                            <p className="section-kicker">Output artifacts</p>
                            <div className="list-stack">
                              {filteredArtifacts.map((artifact) => (
                                <div key={artifact.id} className="list-row">
                                  <div>
                                    <strong>{artifact.title}</strong>
                                    <p>{artifact.summary}</p>
                                  </div>
                                  <span className="status-pill">{artifact.kind}</span>
                                </div>
                              ))}
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
                                disabled={isPublishingRoom}
                                onClick={() => void handlePublishInvestorRoom()}
                                type="button"
                              >
                                {isPublishingRoom ? "Publishing..." : "Publish to investor room"}
                              </button>
                            </div>
                          </div>
                        </div>
                      </article>
                    </section>
                  )}
                </>
              )}

              {activeModule !== "inbox" ? (
                <section className="surface-card command-surface">
                  <div className="panel-header">
                    <div>
                      <p className="section-kicker">Workspace command surface</p>
                      <h3>Drive the {activeModuleMeta.label.toLowerCase()} module directly.</h3>
                    </div>
                  </div>
                  <p className="section-copy">
                    Send a founder request from this module and route the output back into the
                    shared run and artifact layer.
                  </p>
                  <div className="prompt-row">
                    {defaultSuggestions[activeModule].map((suggestion) => (
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
                      aria-label={`${activeModuleMeta.label} prompt`}
                      className="composer-input"
                      placeholder={`Ask VXV to work on ${activeModuleMeta.label.toLowerCase()}...`}
                      rows={4}
                      value={composerDraft}
                      onChange={(event) => setComposerDraft(event.target.value)}
                    />
                    <div className="button-row">
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
                        {isSending ? "Sending..." : `Send to ${activeModuleMeta.label}`}
                      </button>
                      {activeModule === "capital" ? (
                        <button
                          className="ghost-action"
                          disabled={isPublishingRoom}
                          onClick={() => void handlePublishInvestorRoom()}
                          type="button"
                        >
                          {isPublishingRoom ? "Publishing..." : "Publish investor room"}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : null}
            </main>

            <aside className="context-rail">
              <section className="context-card">
                <p className="section-kicker">Context rail</p>
                <h3>Active artifact</h3>
                {selectedArtifact ? (
                  <div className="context-block">
                    <strong>{selectedArtifact.title}</strong>
                    <p>{selectedArtifact.summary}</p>
                    <small>Updated {formatTimestamp(selectedArtifact.updated_at)}</small>
                  </div>
                ) : (
                  <p>No active artifact selected.</p>
                )}
              </section>

              <section className="context-card">
                <p className="section-kicker">Linked trace</p>
                <h3>Recent runs</h3>
                <div className="timeline-list">
                  {(filteredRuns.length > 0 ? filteredRuns : data.task_runs.slice(0, 3)).map((task) => (
                    <div key={task.id} className="timeline-item">
                      <strong>{task.title}</strong>
                      <p>{task.trace_summary}</p>
                      <small>{formatTimestamp(task.created_at)}</small>
                    </div>
                  ))}
                </div>
              </section>

              <section className="context-card">
                <p className="section-kicker">Approval states</p>
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
              </section>

              {activeAgent ? (
                <section className="context-card">
                  <p className="section-kicker">Active operator</p>
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

              <section className="context-card">
                <p className="section-kicker">Runtime</p>
                <h3>{data.integrations.mode}</h3>
                <p>{data.integrations.runtime_reason ?? "Workspace runtime status is available."}</p>
              </section>
            </aside>
          </div>
        </div>
      </div>
  );
}

export default App;
