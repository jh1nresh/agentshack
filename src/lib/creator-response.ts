export const CREATOR_RESPONSE_MAX_BYTES = 1_048_576;

export type BoundedResponseRead =
  | { ok: true; text: string }
  | { ok: false; text: ''; error: string };

export async function readBoundedResponseText(
  response: Response,
  maxBytes: number,
  error: string,
): Promise<BoundedResponseRead> {
  const contentLength = Number(response.headers.get('content-length') ?? 0);
  if (contentLength > maxBytes) {
    return { ok: false, text: '', error };
  }

  if (!response.body) {
    const text = await response.text();
    if (new TextEncoder().encode(text).byteLength <= maxBytes) {
      return { ok: true, text };
    }
    return { ok: false, text: '', error };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytesRead = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytesRead += value.byteLength;
      if (bytesRead > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, text: '', error };
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return { ok: true, text: chunks.join('') };
  } finally {
    reader.releaseLock();
  }
}

export type CreatorResponseRead = BoundedResponseRead;

export async function readCreatorResponseText(
  response: Response,
  maxBytes = CREATOR_RESPONSE_MAX_BYTES,
): Promise<CreatorResponseRead> {
  return readBoundedResponseText(
    response,
    maxBytes,
    `Creator response exceeds ${maxBytes} bytes`,
  );
}
