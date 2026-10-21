import { Client } from "@line/bot-sdk";
import { lineTextMessages } from "./webhook";

export const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

export async function replyText(replyToken: string, text: string) {
  const messages = lineTextMessages(text).map((part) => ({ type: "text" as const, text: part }));
  if (!messages.length) return;
  await lineClient.replyMessage(replyToken, messages);
}
