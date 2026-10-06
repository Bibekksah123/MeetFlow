import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMeetingAccessToken,
  getLiveKitServerConfig,
  LiveKitConfigurationError,
} from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("LiveKit server configuration", () => {
  it("normalizes the room URL for the browser and server APIs", () => {
    vi.stubEnv("LIVEKIT_URL", "wss://meetflow.example.livekit.cloud/");
    vi.stubEnv("LIVEKIT_API_KEY", "test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "test-secret");

    expect(getLiveKitServerConfig()).toMatchObject({
      clientUrl: "wss://meetflow.example.livekit.cloud",
      apiUrl: "https://meetflow.example.livekit.cloud",
    });
  });

  it("rejects incomplete or unsupported configuration", () => {
    vi.stubEnv("LIVEKIT_URL", "ftp://meetflow.example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "test-secret");

    expect(() => getLiveKitServerConfig()).toThrow(LiveKitConfigurationError);
  });

  it("mints a time-limited token with only room media permissions", async () => {
    vi.stubEnv("LIVEKIT_URL", "wss://meetflow.example.livekit.cloud");
    vi.stubEnv("LIVEKIT_API_KEY", "test-key");
    vi.stubEnv("LIVEKIT_API_SECRET", "test-secret-for-local-tests-only-0000");

    const token = await createMeetingAccessToken({
      roomName: "meeting-room-id",
      identity: "meetflow-test-participant",
      participantName: "Test Participant",
    });
    const payloadPart = token.split(".")[1];
    if (!payloadPart) throw new Error("Access token has no payload.");
    const payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8")) as {
      sub: string;
      name: string;
      exp: number;
      video: Record<string, unknown>;
    };
    const expectedExpiration = Math.floor(Date.now() / 1000) + 4 * 60 * 60;

    expect(payload.sub).toBe("meetflow-test-participant");
    expect(payload.name).toBe("Test Participant");
    expect(Math.abs(payload.exp - expectedExpiration)).toBeLessThanOrEqual(5);
    expect(payload.video).toMatchObject({
      room: "meeting-room-id",
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: false,
    });
  });
});
