import { describe, expect, it } from "vitest";

import { readBoundedRequestBody, RequestBodyTooLargeError } from "./request-body";

describe("bounded request body reader", () => {
  it("reads a body within the configured byte limit", async () => {
    const request = new Request("https://meetflow.example/api", {
      method: "POST",
      body: JSON.stringify({ action: "start" }),
    });

    await expect(readBoundedRequestBody(request, 64)).resolves.toBe('{"action":"start"}');
  });

  it("rejects a body using its declared content length", async () => {
    const request = new Request("https://meetflow.example/api", {
      method: "POST",
      body: "{}",
      headers: { "content-length": "9000" },
    });

    await expect(readBoundedRequestBody(request, 4096)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it("enforces the byte limit while streaming a body without content length", async () => {
    const request = new Request("https://meetflow.example/api", {
      method: "POST",
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("1234"));
          controller.enqueue(new TextEncoder().encode("5678"));
          controller.close();
        },
      }),
      // A ReadableStream body has no automatic Content-Length.
      // @ts-expect-error Node's fetch Request requires the streaming-body opt-in.
      duplex: "half",
    });

    await expect(readBoundedRequestBody(request, 6)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });
});
