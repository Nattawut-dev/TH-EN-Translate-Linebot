export const MAX_WEBHOOK_BODY_BYTES = 2 * 1024 * 1024;

export class RequestBodyTooLarge extends Error {
  constructor() { super("request_body_too_large"); }
}

export async function readBoundedRequestBody(request: Request, limit = MAX_WEBHOOK_BODY_BYTES): Promise<string> {
  const declared = request.headers.get("content-length");
  if (declared && Number(declared) > limit) throw new RequestBodyTooLarge();
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new RequestBodyTooLarge();
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const body = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(body);
}
