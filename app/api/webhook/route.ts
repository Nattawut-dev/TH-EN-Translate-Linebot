import { NextRequest, NextResponse } from "next/server";
import { validateSignature, type WebhookEvent } from "@line/bot-sdk";
import { replyText } from "@/lib/line";
import { translateMessage } from "@/lib/translate";
import { handleWebhookEvents } from "@/lib/webhook";
import { PROMPT_VERSION } from "@/lib/translatePrompt";

import { readBoundedRequestBody, RequestBodyTooLarge } from "@/lib/requestBody";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let body: string;
  try { body = await readBoundedRequestBody(req); }
  catch (error) { return NextResponse.json({ error: "invalid request" }, { status: error instanceof RequestBodyTooLarge ? 413 : 400 }); }
  const secret = process.env.LINE_CHANNEL_SECRET;
  const signature = req.headers.get("x-line-signature") || "";
  if (!secret || !validateSignature(body, secret, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }
  let payload: { events: WebhookEvent[]; destination: string };
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "invalid request" }, { status: 400 }); }
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.events) || typeof payload.destination !== "string") {
    return NextResponse.json({ error: "invalid request" }, { status: 400 });
  }
  await handleWebhookEvents(payload.events, payload.destination, {
    translate: translateMessage, reply: replyText,
    reportFailure: (code) => console.error("translation event failed", { code }),
  });
  return NextResponse.json({ status: "ok" });
}

export async function GET() {
  return NextResponse.json({ message: "Webhook is alive! Please use POST for LINE.", promptVersion: PROMPT_VERSION, contextMode: "request-batch-only", revision: process.env.VERCEL_GIT_COMMIT_SHA ?? null });
}
