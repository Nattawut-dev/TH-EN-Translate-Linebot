const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL!;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN!;

async function redisCommand(command: string[]): Promise<any> {
  const res = await fetch(`${REDIS_URL}/${command.map(encodeURIComponent).join("/")}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  const data = await res.json();
  return data.result;
}

export async function getGroupState(groupId: string): Promise<boolean> {
  const value = await redisCommand(["GET", `group:${groupId}:enabled`]);
  return value === "true";
}

export async function setGroupState(groupId: string, enabled: boolean): Promise<void> {
  await redisCommand(["SET", `group:${groupId}:enabled`, String(enabled)]);
}
