export interface ContextTurn {
  conversation: string;
  speaker: string;
  messageId: string;
  timestamp: number;
  text: string;
}

export interface TranslationContext {
  conversation: string;
  speaker: string;
  timestamp: number;
  recentTurns: readonly ContextTurn[];
}

export const CONTEXT_TTL_MS = 30 * 60 * 1000;
export const MAX_CONTEXT_TURNS = 12;
export const MAX_CONTEXT_CHARACTERS = 2000;

// The caller owns the store. There is deliberately no process-global chat memory.
export function boundedContext(context?: TranslationContext): ContextTurn[] {
  if (!context) return [];
  const candidates = context.recentTurns.filter((turn) =>
    turn.conversation === context.conversation &&
    turn.timestamp <= context.timestamp &&
    turn.timestamp >= context.timestamp - CONTEXT_TTL_MS &&
    turn.text.trim().length > 0
  ).slice(-MAX_CONTEXT_TURNS);
  const selected: ContextTurn[] = [];
  let characters = 0;
  for (let index = candidates.length - 1; index >= 0; index--) {
    const turn = candidates[index];
    const length = [...turn.text].length;
    if (characters + length > MAX_CONTEXT_CHARACTERS) break;
    selected.unshift(turn);
    characters += length;
  }
  return selected;
}
