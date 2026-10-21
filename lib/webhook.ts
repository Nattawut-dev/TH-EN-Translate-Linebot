import { createHash } from "node:crypto";
import type { WebhookEvent } from "@line/bot-sdk";
import { shouldTranslate } from "./shouldTranslate";
import { TranslationError } from "./translate";
import { boundedContext, type ContextTurn, type TranslationContext } from "./translationContext";

interface Dependencies {
  translate: (text: string, context: TranslationContext) => Promise<string>;
  reply: (token: string, text: string) => Promise<void>;
  reportFailure: (code: string) => void;
}

export function conversationKey(destination: string, event: WebhookEvent): string | null {
  const source = event.source;
  if (!source || !["user", "group", "room"].includes(source.type)) return null;
  const id = source.type === "user" ? source.userId : source.type === "group" ? source.groupId : source.roomId;
  return typeof id === "string" && id ? JSON.stringify([destination, source.type, id]) : null;
}

function findBreakPoint(text: string, offset: number, maxEnd: number): number {
  const windowStart = Math.max(offset + 3000, offset + Math.floor((maxEnd - offset) * 0.7));
  const chunk = text.slice(offset, maxEnd);
  const lastPara = chunk.lastIndexOf("\n\n");
  if (lastPara >= 0 && offset + lastPara + 2 >= windowStart) return offset + lastPara + 2;
  const lastLine = chunk.lastIndexOf("\n");
  if (lastLine >= 0 && offset + lastLine + 1 >= windowStart) return offset + lastLine + 1;
  const sentenceMatch = [...chunk.matchAll(/[.!?][\s]+/gu)].pop();
  if (sentenceMatch && sentenceMatch.index !== undefined) {
    const endPos = offset + sentenceMatch.index + sentenceMatch[0].length;
    if (endPos >= windowStart) return endPos;
  }
  const lastSpace = chunk.lastIndexOf(" ");
  if (lastSpace >= 0 && offset + lastSpace + 1 >= windowStart) return offset + lastSpace + 1;
  return maxEnd;
}

export function lineTextMessages(text: string): string[] {
  if (text.length > 25000) throw new Error("reply_too_long");
  const messages: string[] = [];
  for (let offset = 0; offset < text.length;) {
    let end = Math.min(offset + 5000, text.length);
    if (end < text.length) {
      end = findBreakPoint(text, offset, end);
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1])) end--;
    }
    messages.push(text.slice(offset, end));
    offset = end;
  }
  return messages;
}

// Request-local context only. Durable history/idempotency requires an approved shared store.
export async function handleWebhookEvents(events: WebhookEvent[], destination: string, dependencies: Dependencies) {
  const rooms = new Map<string, WebhookEvent[]>();
  const seen = new Set<string>();
  for (const event of events) {
    if (!event || typeof event !== "object" || event.mode !== "active" || !Number.isFinite(event.timestamp)) continue;
    const key = conversationKey(destination, event);
    if (!key) continue;
    if (event.webhookEventId) {
      if (seen.has(event.webhookEventId)) continue;
      seen.add(event.webhookEventId);
    }
    const room = rooms.get(key) ?? [];
    room.push(event);
    rooms.set(key, room);
  }
  const entries = [...rooms.entries()];
  let nextRoom = 0;
  await Promise.all(Array.from({ length: Math.min(4, entries.length) }, async () => {
    while (nextRoom < entries.length) {
      const [conversation, room] = entries[nextRoom++];
      const turns: ContextTurn[] = [];
      for (const event of room.sort((a, b) => a.timestamp - b.timestamp)) {
        if (event.type === "unsend") {
          const index = turns.findIndex((turn) => turn.messageId === event.unsend.messageId);
          if (index >= 0) turns.splice(index, 1);
          continue;
        }
        if (event.type !== "message" || !event.message || event.message.type !== "text" || typeof event.message.text !== "string") continue;
        const text = event.message.text;
        const sourceSpeaker = typeof event.source.userId === "string" ? event.source.userId : undefined;
        const speaker = sourceSpeaker ? createHash("sha256").update(sourceSpeaker).digest("hex").slice(0, 16) : `unknown_${event.message.id}`;
        const context: TranslationContext = { conversation, speaker, timestamp: event.timestamp, recentTurns: turns };
        if (!text.trim().startsWith("/")) {
          try {
            if (shouldTranslate(text)) {
              const translation = await dependencies.translate(text, context);
              await dependencies.reply(event.replyToken, translation);
            }
          } catch (error) {
            dependencies.reportFailure(error instanceof TranslationError ? error.code : "event_failed");
          }
          turns.push({ conversation, speaker, messageId: event.message.id, timestamp: event.timestamp, text });
          turns.splice(0, turns.length, ...boundedContext({ ...context, recentTurns: turns }));
        }
      }
    }
  }));
}
