import { Client } from "@line/bot-sdk";

export const lineClient = new Client({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN!,
  channelSecret: process.env.LINE_CHANNEL_SECRET!,
});

export async function replyText(replyToken: string, text: string) {
  await lineClient.replyMessage(replyToken, { type: "text", text });
}
