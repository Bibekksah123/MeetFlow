export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the configured size limit.");
    this.name = "RequestBodyTooLargeError";
  }
}

/** Read a request body while enforcing the limit even when Content-Length is absent. */
export async function readBoundedRequestBody(request: Request, maxBytes: number): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return "";

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let byteLength = 0;
  let body = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteLength += value.byteLength;
      if (byteLength > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      body += decoder.decode(value, { stream: true });
    }
    return body + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}
