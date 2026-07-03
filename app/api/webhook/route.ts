import { NextRequest, NextResponse } from "next/server";
import { validateSignature, WebhookEvent } from "@line/bot-sdk";
import { replyText } from "@/lib/line";
import { translateMessage } from "@/lib/translate";
import { shouldTranslate } from "@/lib/shouldTranslate";
import { getGroupState, setGroupState } from "@/lib/groupState";

export async function POST(req: NextRequest) {
  const body = await req.text();
  const signature = req.headers.get("x-line-signature") || "";

  if (!validateSignature(body, process.env.LINE_CHANNEL_SECRET!, signature)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const events: WebhookEvent[] = JSON.parse(body).events;

  await Promise.all(events.map(handleEvent));

  return NextResponse.json({ status: "ok" });
}

async function handleEvent(event: WebhookEvent) {
  try {
    if (event.type !== "message" || event.message.type !== "text") return;

    const text = event.message.text;
    const replyToken = event.replyToken;
    const sourceType = event.source.type; // 'user' | 'group' | 'room'

    if (sourceType === "user") {
      // แชทเดี่ยว: แปลอัตโนมัติเสมอ
      if (!shouldTranslate(text)) return;
      const translated = await translateMessage(text);
      await replyText(replyToken, translated);
      return;
    }

    // group / room
    const sourceId =
      event.source.type === "group" ? event.source.groupId : event.source.roomId;

    if (text.startsWith("/translate")) {
      const enable = text.includes("on");
      await setGroupState(sourceId!, enable);
      await replyText(replyToken, enable ? "เปิดแปลอัตโนมัติแล้ว" : "ปิดแปลอัตโนมัติแล้ว");
      return;
    }

    const isEnabled = await getGroupState(sourceId!);
    if (!isEnabled) return;
    if (!shouldTranslate(text)) return;

    const translated = await translateMessage(text);
    await replyText(replyToken, translated);
  } catch (err) {
    // fallback เงียบๆ ไม่ reply error ในแชท
    console.error("handleEvent error:", err);
  }
}
