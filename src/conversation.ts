import type { PluginConfiguration } from "./config.js";
import { isRecord, textFromParts } from "./shared.js";

export const HISTORY_TIMEOUT_MS = 1_000;
export const HISTORY_MESSAGE_LIMIT = 32;
export const MAX_CONVERSATION_TURNS = 8;
export const MAX_CONVERSATION_CHARACTERS = 12_000;

export type ConversationTurn = { role: "user" | "assistant"; text: string };
export type ConversationContext = {
  turns: ConversationTurn[];
  /** Evidence of omission, not a guarantee of completeness when false. */
  incomplete: boolean;
  /** V1 returned a full page; more history may exist, but is not known to exist. */
  historyLimitReached?: boolean;
};

/** Keep whole recent turns: a text preview could hide a revocation. */
export function boundedConversation(turns: ConversationTurn[]): ConversationContext {
  const selected: ConversationTurn[] = [];
  let characters = 0;
  for (const turn of turns.toReversed()) {
    if (
      selected.length === MAX_CONVERSATION_TURNS ||
      characters + turn.text.length > MAX_CONVERSATION_CHARACTERS
    )
      break;
    selected.unshift(turn);
    characters += turn.text.length;
  }
  return { turns: selected, incomplete: selected.length !== turns.length };
}

export function conversationFromMessages(input: {
  messages: unknown;
  generation: "v1" | "v2";
  sessionID: string;
  includeAssistant: boolean;
}): ConversationContext {
  const messages =
    isRecord(input.messages) && "data" in input.messages ? input.messages.data : input.messages;
  if (!Array.isArray(messages)) throw new Error("Session history did not return messages.");
  // A full V1 page is evidence of a possible page boundary, not proof of truncation.
  const historyLimitReached = input.generation === "v1" && messages.length >= HISTORY_MESSAGE_LIMIT;
  let incomplete = false;
  const turns: ConversationTurn[] = [];
  for (const message of messages) {
    if (!isRecord(message)) continue;
    const info = input.generation === "v1" ? message.info : message;
    if (!isRecord(info) || (info.sessionID !== undefined && info.sessionID !== input.sessionID))
      continue;
    const parts = input.generation === "v1" ? message.parts : message.content;
    if (hasCompaction({ info, parts })) {
      incomplete = true;
      continue;
    }
    const turn = humanTurn({
      message,
      info,
      parts,
      generation: input.generation,
      includeAssistant: input.includeAssistant,
    });
    if (turn) turns.push(turn);
    // OpenCode V2 stores answers to the interactive question tool as structured
    // assistant tool-result metadata, not as ordinary user messages.
    if (
      input.generation === "v2" &&
      info.type === "assistant" &&
      !excluded(info) &&
      !(isRecord(info.metadata) && excluded(info.metadata))
    ) {
      for (const answer of questionAnswers(parts)) turns.push({ role: "user", text: answer });
    }
  }
  const conversation = boundedConversation(turns);
  conversation.incomplete ||= incomplete;
  if (historyLimitReached) conversation.historyLimitReached = true;
  return conversation;
}

function hasCompaction(input: { info: Record<string, unknown>; parts: unknown }): boolean {
  return Boolean(
    input.info.summary === true ||
    input.info.type === "compaction" ||
    (isRecord(input.info.metadata) && input.info.metadata.summary === true) ||
    (Array.isArray(input.parts) &&
      input.parts.some((part) => isRecord(part) && part.type === "compaction")),
  );
}

function excluded(info: Record<string, unknown>): boolean {
  return Boolean(
    info.synthetic ||
    info.ignored ||
    info.summary === true ||
    info.agent === "auto-approval-reviewer",
  );
}

function humanTurn(input: {
  message: Record<string, unknown>;
  info: Record<string, unknown>;
  parts: unknown;
  generation: "v1" | "v2";
  includeAssistant: boolean;
}): ConversationTurn | undefined {
  if (excluded(input.info) || (isRecord(input.info.metadata) && excluded(input.info.metadata)))
    return undefined;
  const role = input.generation === "v1" ? input.info.role : input.info.type;
  if (role !== "user" && !(role === "assistant" && input.includeAssistant)) return undefined;
  const text =
    input.generation === "v2" && role === "user"
      ? typeof input.message.text === "string"
        ? input.message.text
        : ""
      : Array.isArray(input.parts)
        ? textFromParts({ parts: input.parts, skipSyntheticOrIgnored: true })
        : "";
  return text.trim() || role === "user" ? { role, text } : undefined;
}

/**
 * Genuine responses to OpenCode's question tool are human decisions, even
 * though the host stores them in an assistant tool-result part.
 * Reject free-form model-authored output and cancelled/running questions.
 */
function questionAnswers(parts: unknown): string[] {
  if (!Array.isArray(parts)) return [];
  const turns: string[] = [];
  for (const part of parts) {
    if (!isRecord(part) || part.type !== "tool" || part.name !== "question") continue;
    const state = part.state;
    if (!isRecord(state) || state.status !== "completed" || !isRecord(state.metadata)) continue;
    const questions = isRecord(state.input) ? state.input.questions : undefined;
    const answers = state.metadata.answers;
    if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length)
      continue;
    for (let i = 0; i < questions.length; i++) {
      const prompt = questions[i];
      const answer = answers[i];
      if (!isRecord(prompt) || typeof prompt.question !== "string" || !Array.isArray(answer))
        continue;
      if (answer.length === 0 || answer.some((value) => typeof value !== "string")) continue;
      const response = answer
        .map((value: string) => value.trim())
        .filter(Boolean)
        .join(", ");
      if (!response) continue;
      turns.push(`User answered OpenCode question "${prompt.question}": "${response}"`);
    }
  }
  return turns;
}

/** Stop waiting for `promise` after `ms`; the underlying work is not cancelled. */
export async function withTimeout<T>(input: {
  promise: Promise<T>;
  ms: number;
  message: string;
}): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      input.promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(input.message)), input.ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/** No cache: re-read the host and reconcile the live prompt before every review. */
export async function readConversation(input: {
  load(): Promise<ConversationContext>;
  latest(): string | undefined;
  configuration: PluginConfiguration["conversation"];
}): Promise<{ userIntent?: string; conversation?: ConversationContext }> {
  // Disabled, the reviewer sees the captured prompt only, as before the option existed.
  if (!input.configuration.enabled) {
    const latest = input.latest();
    return latest === undefined ? {} : { userIntent: latest };
  }
  let conversation: ConversationContext = { turns: [], incomplete: false };
  try {
    conversation = await withTimeout({
      promise: input.load(),
      ms: HISTORY_TIMEOUT_MS,
      message: "Session history timed out.",
    });
  } catch {
    conversation.incomplete = true;
  }
  const latest = input.latest();
  if (
    latest !== undefined &&
    !conversation.turns.some((turn) => turn.role === "user" && turn.text === latest)
  ) {
    conversation.turns.push({ role: "user", text: latest });
  }
  // Keep the latest intent even if it cannot fit as a whole conversation turn.
  // A completed question answer is a later user decision even if the most
  // recent ordinary chat prompt is older. A new prompt is appended above.
  const userIntent = conversation.turns.findLast((turn) => turn.role === "user")?.text ?? latest;
  const bounded = boundedConversation(conversation.turns);
  bounded.incomplete ||= conversation.incomplete;
  if (conversation.historyLimitReached) bounded.historyLimitReached = true;
  return { userIntent, conversation: bounded };
}
