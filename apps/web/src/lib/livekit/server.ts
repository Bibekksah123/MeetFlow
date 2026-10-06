import "server-only";

import { AccessToken, RoomServiceClient } from "livekit-server-sdk";

import { hasUnmutedMediaTrack } from "../recording-readiness";

export class LiveKitConfigurationError extends Error {
  constructor() {
    super("LiveKit server configuration is incomplete or invalid.");
    this.name = "LiveKitConfigurationError";
  }
}

export type LiveKitServerConfig = {
  clientUrl: string;
  apiUrl: string;
  apiKey: string;
  apiSecret: string;
};

export function getLiveKitServerConfig(): LiveKitServerConfig {
  const rawUrl = process.env.LIVEKIT_URL;
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  if (!rawUrl || !apiKey || !apiSecret) throw new LiveKitConfigurationError();

  let clientUrl: URL;
  try {
    clientUrl = new URL(rawUrl);
  } catch {
    throw new LiveKitConfigurationError();
  }

  if (
    clientUrl.username ||
    clientUrl.password ||
    !["http:", "https:", "ws:", "wss:"].includes(clientUrl.protocol)
  ) {
    throw new LiveKitConfigurationError();
  }

  const apiUrl = new URL(clientUrl);
  if (clientUrl.protocol === "http:") clientUrl.protocol = "ws:";
  if (clientUrl.protocol === "https:") clientUrl.protocol = "wss:";
  if (apiUrl.protocol === "ws:") apiUrl.protocol = "http:";
  if (apiUrl.protocol === "wss:") apiUrl.protocol = "https:";

  return {
    clientUrl: clientUrl.toString().replace(/\/+$/, ""),
    apiUrl: apiUrl.toString().replace(/\/+$/, ""),
    apiKey,
    apiSecret,
  };
}

export async function createMeetingAccessToken(options: {
  roomName: string;
  identity: string;
  participantName: string;
}): Promise<string> {
  const config = getLiveKitServerConfig();
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: options.identity,
    name: options.participantName,
    ttl: "4h",
  });
  token.addGrant({
    roomJoin: true,
    room: options.roomName,
    canPublish: true,
    canSubscribe: true,
    canPublishData: false,
  });

  return token.toJwt();
}

export function createLiveKitRoomServiceClient(): RoomServiceClient {
  const config = getLiveKitServerConfig();
  return new RoomServiceClient(config.apiUrl, config.apiKey, config.apiSecret);
}

export async function hasActiveRoomMedia(roomName: string): Promise<boolean> {
  const participants = await createLiveKitRoomServiceClient().listParticipants(roomName);
  return hasUnmutedMediaTrack(participants);
}
