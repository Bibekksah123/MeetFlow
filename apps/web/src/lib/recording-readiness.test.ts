import { describe, expect, it } from "vitest";

import { hasUnmutedMediaTrack } from "./recording-readiness";

describe("recording media readiness", () => {
  it("requires a connected participant to publish an unmuted media track", () => {
    expect(hasUnmutedMediaTrack([])).toBe(false);
    expect(hasUnmutedMediaTrack([{ tracks: [] }])).toBe(false);
    expect(hasUnmutedMediaTrack([{ tracks: [{ muted: true }] }])).toBe(false);
    expect(hasUnmutedMediaTrack([{ tracks: [{ muted: false }] }])).toBe(true);
  });
});
