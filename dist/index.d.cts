//#region src/config.d.ts
declare const reviewerModes: readonly ["on-ask", "all-tools"];
declare const decisionProviders: readonly ["typesafe", "cloudflare"];
type ReviewerMode = (typeof reviewerModes)[number];
/** The runtimes driven through an SDK, and the option holding each one's package directory. */
declare const sdkRuntimes: {
  readonly "claude-agent-sdk": {
    readonly option: "claudeAgentSdk";
    readonly example: "claude-sonnet-5-5";
  };
  readonly "codex-sdk": {
    readonly option: "codexSdk";
    readonly example: "gpt-5.6-codex";
  };
};
type SdkRuntime = keyof typeof sdkRuntimes;
type ReviewerBackend = "agent" | "chat" | "decision";
/** What the decision backend does with an operation too large for its model. */
declare const oversizeActions: readonly ["escalate", "agent", "chat"];
type OversizeAction = (typeof oversizeActions)[number];
type DecisionProvider = (typeof decisionProviders)[number];
type ModelReference = {
  providerID: string;
  modelID: string;
};
type DecisionConfiguration = {
  provider: DecisionProvider;
  apiKey: string;
  /** Full URL of the System One compatible decision endpoint. */
  endpoint: string;
  model: string;
  /** An `allow` below this probability is downgraded to `escalate`. */
  minAllowProbability: number;
  /** The estimated `state` size above which an operation is not sent. */
  maxStateTokens: number;
  /**
   * `typesafe` only: operations above `maxStateTokens` and up to this budget
   * are sent with TypeSafe's long-context header instead of being too large.
   */
  longContext?: LongContextConfiguration;
  onOversize: OversizeAction;
};
type LongContextConfiguration = {
  /** The estimated `state` size above which even a long-context request is not sent. */
  maxStateTokens: number;
  /** An `allow` from a long-context request below this probability is downgraded to `escalate`. */
  minAllowProbability: number;
};
/**
 * `openai-compatible` posts to any Chat Completions endpoint; `openai` and
 * `anthropic` call the vendor's own API on a fixed host with its own key.
 */
declare const chatProviders: readonly ["openai-compatible", "openai", "anthropic"];
type ChatProvider = (typeof chatProviders)[number];
type ChatConfiguration = {
  provider: ChatProvider;
  apiKey: string;
  /** Full URL of the Chat Completions endpoint, or Anthropic's Messages endpoint. */
  endpoint: string;
  model: string;
  /** A whole prompt (instructions and operation) longer than this, in UTF-8 bytes, is not sent. */
  maxInputBytes: number;
};
type AgentConfiguration = {
  /** Prompts longer than this, in UTF-8 bytes, escalate unsent. */
  maxInputBytes: number;
} & ({
  runtime: "opencode";
  /** The reviewer session's model; the main session's when unset. */
  model?: ModelReference;
} | {
  runtime: SdkRuntime;
  /** A model name for Claude Code or Codex; the tool's own default when unset. */
  model?: string;
  /**
   * The installed SDK package directory, used instead of importing it from
   * where the plugin is installed.
   */
  sdkPath?: string;
});
type PluginConfiguration = {
  mode: ReviewerMode;
  auditLog: {
    enabled: boolean;
    includeCommand: boolean;
    path?: string;
  };
  conversation: {
    enabled: boolean;
    includeAssistant: boolean;
  };
  reviewer: {
    backend: ReviewerBackend;
    agent: AgentConfiguration;
    timeoutMs: number;
    /** The user's own review policy, added to every review as trusted guidance. */
    instructions?: string;
    /** Whether decision and chat reviews are appended to the usage log. */
    recordUsage: boolean;
    decision?: DecisionConfiguration;
    chat?: ChatConfiguration;
  };
};
//#endregion
//#region src/conversation.d.ts
type ConversationTurn = {
  role: "user" | "assistant";
  text: string;
};
type ConversationContext = {
  turns: ConversationTurn[];
  /** Evidence of omission, not a guarantee of completeness when false. */
  incomplete: boolean;
  /** V1 returned a full page; more history may exist, but is not known to exist. */
  historyLimitReached?: boolean;
};
//#endregion
//#region src/reviewer.d.ts
/**
 * The contract every review backend shares, and the helpers they all use.
 */
type ReviewSource = "permission-request" | "tool-call";
type ReviewRequest = {
  source: ReviewSource;
  sessionID: string;
  action: string;
  resource: unknown;
  userIntent?: string;
  conversation?: ConversationContext;
  model?: ModelReference;
};
type ReviewVerdict = {
  verdict: "allow" | "deny" | "escalate";
  reason: string;
  /** Backend-reported probability of its selected choice; never parsed from prose. */
  confidence?: number;
};
/**
 * Transport between the reviewer and an OpenCode session. Implemented once per
 * plugin API generation (V1 SDK client, V2 plugin context) so the review logic
 * stays independent of how a session is created and prompted.
 */
type ReviewSessionClient = {
  /**
   * Creates an isolated reviewer session and returns its ID. `model` is the
   * one the whole session must use; a transport that can only choose a model
   * per prompt remembers it here.
   */
  create(input: {
    model?: ModelReference;
    parentID?: string;
  }): Promise<{
    sessionID: string;
  }>;
  /** Sends the review prompt and resolves with the reviewer's final reply text. */
  prompt(input: {
    sessionID: string;
    text: string;
  }): Promise<string>;
  /** Best-effort cancellation after a timeout or failure. */
  abort(input: {
    sessionID: string;
  }): Promise<unknown>;
  /** Optional cleanup for hosts that support deleting temporary review sessions. */
  remove?(input: {
    sessionID: string;
  }): Promise<unknown>;
};
/** A review backend: the agent session or the decision model API. */
type Reviewer = {
  review(input: ReviewRequest): Promise<ReviewVerdict>;
  /** Whether a session belongs to the reviewer itself and must not be reviewed. */
  isReviewerSession(input: {
    sessionID: string;
  }): boolean;
};
//#endregion
//#region src/shared.d.ts
type PluginDependencies = {
  createReviewer(input: {
    client: ReviewSessionClient;
    configuration: PluginConfiguration;
    /** The project directory OpenCode loaded the plugin for. */
    directory: string;
  }): Reviewer;
};
//#endregion
//#region src/index.d.ts
/**
 * One package, both plugin API generations: opencode 2.x loads the V2
 * `id` + `setup` definition, while opencode 1.18.29+ calls `server()`.
 * `Plugin.define()` from `@opencode/plugin` is an identity function, so the
 * definition is spelled out here to keep the package free of runtime imports.
 */
export declare function createAutoApprovalPlugin(input?: {
  dependencies?: Partial<PluginDependencies>;
}): {
  id: string;
  setup: (context: import("@opencode/plugin/promise/plugin").Context) => Promise<import("@opencode/plugin/promise/plugin").Cleanup | void> | import("@opencode/plugin/promise/plugin").Cleanup | void;
  server: import("@opencode-ai/plugin").Plugin;
};
declare const _default: {
  id: string;
  setup: (context: import("@opencode/plugin/promise/plugin").Context) => Promise<import("@opencode/plugin/promise/plugin").Cleanup | void> | import("@opencode/plugin/promise/plugin").Cleanup | void;
  server: import("@opencode-ai/plugin").Plugin;
};
//#endregion
export { _default as default };
//# sourceMappingURL=index.d.cts.map