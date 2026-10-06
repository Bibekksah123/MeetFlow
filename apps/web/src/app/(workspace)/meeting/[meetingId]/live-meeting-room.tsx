"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ConnectionState,
  Room,
  RoomEvent,
  Track,
  type Participant,
  type Track as LiveKitTrack,
} from "livekit-client";

import { Badge, Button, Card, ErrorState, LoadingState } from "@meetflow/ui";

type LiveMeetingRoomProps = {
  meetingId: string;
  meetingTitle: string;
  meetingStatus: "scheduled" | "active" | "completed";
  isHost: boolean;
};

export function LiveMeetingRoom({
  meetingId,
  meetingTitle,
  meetingStatus,
  isHost,
}: LiveMeetingRoomProps) {
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const roomRef = useRef<Room | null>(null);
  const [connectionState, setConnectionState] = useState(ConnectionState.Disconnected);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isMicrophoneEnabled, setIsMicrophoneEnabled] = useState(false);
  const [isScreenShareEnabled, setIsScreenShareEnabled] = useState(false);
  const [joining, setJoining] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [busyControl, setBusyControl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!expanded) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setExpanded(false);
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [expanded]);

  useEffect(() => {
    if (!room) return;

    const refreshParticipantState = () => {
      setParticipants([room.localParticipant, ...room.remoteParticipants.values()]);
      setIsCameraEnabled(room.localParticipant.isCameraEnabled);
      setIsMicrophoneEnabled(room.localParticipant.isMicrophoneEnabled);
      setIsScreenShareEnabled(room.localParticipant.isScreenShareEnabled);
    };
    const handleConnectionState = (state: ConnectionState) => setConnectionState(state);
    const handleReconnecting = () => setConnectionState(ConnectionState.Reconnecting);
    const handleReconnected = () => {
      setConnectionState(ConnectionState.Connected);
      setNotice("Connection restored.");
    };
    const handleDisconnected = () => {
      setConnectionState(ConnectionState.Disconnected);
      if (roomRef.current === room) roomRef.current = null;
      setRoom((currentRoom) => (currentRoom === room ? null : currentRoom));
      setParticipants([]);
      setIsCameraEnabled(false);
      setIsMicrophoneEnabled(false);
      setIsScreenShareEnabled(false);
      setExpanded(false);
      router.refresh();
    };

    room.on(RoomEvent.ConnectionStateChanged, handleConnectionState);
    room.on(RoomEvent.Reconnecting, handleReconnecting);
    room.on(RoomEvent.Reconnected, handleReconnected);
    room.on(RoomEvent.Disconnected, handleDisconnected);
    room.on(RoomEvent.ParticipantConnected, refreshParticipantState);
    room.on(RoomEvent.ParticipantDisconnected, refreshParticipantState);
    room.on(RoomEvent.TrackSubscribed, refreshParticipantState);
    room.on(RoomEvent.TrackUnsubscribed, refreshParticipantState);
    room.on(RoomEvent.LocalTrackPublished, refreshParticipantState);
    room.on(RoomEvent.LocalTrackUnpublished, refreshParticipantState);
    room.on(RoomEvent.TrackMuted, refreshParticipantState);
    room.on(RoomEvent.TrackUnmuted, refreshParticipantState);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, handleConnectionState);
      room.off(RoomEvent.Reconnecting, handleReconnecting);
      room.off(RoomEvent.Reconnected, handleReconnected);
      room.off(RoomEvent.Disconnected, handleDisconnected);
      room.off(RoomEvent.ParticipantConnected, refreshParticipantState);
      room.off(RoomEvent.ParticipantDisconnected, refreshParticipantState);
      room.off(RoomEvent.TrackSubscribed, refreshParticipantState);
      room.off(RoomEvent.TrackUnsubscribed, refreshParticipantState);
      room.off(RoomEvent.LocalTrackPublished, refreshParticipantState);
      room.off(RoomEvent.LocalTrackUnpublished, refreshParticipantState);
      room.off(RoomEvent.TrackMuted, refreshParticipantState);
      room.off(RoomEvent.TrackUnmuted, refreshParticipantState);
    };
  }, [room, router]);

  useEffect(
    () => () => {
      void room?.disconnect();
    },
    [room],
  );

  async function joinMeeting() {
    if (joining || room || meetingStatus === "completed") return;
    setJoining(true);
    setError(null);
    setNotice(null);
    setBusyControl(null);

    const nextRoom = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = nextRoom;
    setRoom(nextRoom);
    setConnectionState(ConnectionState.Connecting);

    try {
      const response = await fetch(`/api/meetings/${meetingId}/livekit-token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const payload = (await response.json().catch(() => null)) as {
        token?: unknown;
        serverUrl?: unknown;
        error?: unknown;
      } | null;

      if (
        !response.ok ||
        typeof payload?.token !== "string" ||
        typeof payload.serverUrl !== "string"
      ) {
        throw new Error(
          typeof payload?.error === "string"
            ? payload.error
            : "We could not connect to the meeting. Please try again.",
        );
      }

      if (roomRef.current !== nextRoom) return;

      await nextRoom.connect(payload.serverUrl, payload.token);
      if (roomRef.current !== nextRoom) {
        await nextRoom.disconnect();
        return;
      }
      setParticipants([nextRoom.localParticipant, ...nextRoom.remoteParticipants.values()]);
      setConnectionState(ConnectionState.Connected);
      setNotice("You’re in the meeting. Your camera and microphone start off.");
      setExpanded(true);
      router.refresh();
    } catch (joinError) {
      await nextRoom.disconnect();
      if (roomRef.current === nextRoom) {
        roomRef.current = null;
        setRoom(null);
        setParticipants([]);
        setConnectionState(ConnectionState.Disconnected);
        setExpanded(false);
        setError(
          joinError instanceof Error
            ? joinError.message
            : "We could not connect to the meeting. Please try again.",
        );
      }
    } finally {
      setJoining(false);
    }
  }

  async function leaveMeeting() {
    const currentRoom = room;
    roomRef.current = null;
    setRoom(null);
    setParticipants([]);
    setConnectionState(ConnectionState.Disconnected);
    setIsCameraEnabled(false);
    setIsMicrophoneEnabled(false);
    setIsScreenShareEnabled(false);
    setExpanded(false);
    setBusyControl(null);
    setError(null);
    setNotice("You left the meeting.");
    await currentRoom?.disconnect();
  }

  async function runRoomControl(name: string, operation: () => Promise<unknown>) {
    const currentRoom = room;
    if (!currentRoom || roomRef.current !== currentRoom || busyControl) return;
    setBusyControl(name);
    setError(null);
    try {
      await operation();
      if (roomRef.current !== currentRoom) return;
      setIsCameraEnabled(currentRoom.localParticipant.isCameraEnabled);
      setIsMicrophoneEnabled(currentRoom.localParticipant.isMicrophoneEnabled);
      setIsScreenShareEnabled(currentRoom.localParticipant.isScreenShareEnabled);
      setParticipants([currentRoom.localParticipant, ...currentRoom.remoteParticipants.values()]);
    } catch {
      if (roomRef.current === currentRoom) setError(controlError(name));
    } finally {
      if (roomRef.current === currentRoom) setBusyControl(null);
    }
  }

  const connected = connectionState === ConnectionState.Connected;
  const connectionLabel = getConnectionLabel(connectionState, joining);

  return (
    <Card
      role="region"
      aria-label={expanded ? `Expanded meeting: ${meetingTitle}` : "Live meeting"}
      className={
        expanded
          ? "fixed inset-0 z-50 flex h-dvh w-screen flex-col overflow-hidden rounded-none border-0 bg-[#111820] p-0 text-white"
          : "space-y-5 p-5 sm:p-6"
      }
    >
      <div
        className={
          expanded
            ? "flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3 sm:px-6"
            : "flex flex-wrap items-start justify-between gap-3"
        }
      >
        <div className="min-w-0">
          <h2 className={`${expanded ? "text-white" : "text-ink"} text-base font-semibold`}>
            Live meeting
          </h2>
          <p className={`${expanded ? "text-white/65" : "text-muted"} mt-1 text-sm leading-5`}>
            {expanded
              ? meetingTitle
              : "Join with your camera and microphone off. Turn them on when you’re ready."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge
            variant={connected ? "success" : "brand"}
            className={expanded ? "bg-white/10 text-white" : ""}
          >
            {connectionLabel}
          </Badge>
          <button
            type="button"
            aria-expanded={expanded}
            aria-label={expanded ? "Close expanded meeting view" : "Expand meeting view"}
            title={expanded ? "Close expanded view (Esc)" : "Expand meeting view"}
            onClick={() => setExpanded((current) => !current)}
            className={`${expanded ? "border-white/20 text-white hover:bg-white/10 focus-visible:ring-white" : "border-line text-ink focus-visible:ring-brand hover:bg-[#f6f8fb]"} min-h-9 rounded-lg border px-3 text-xs font-semibold focus-visible:ring-2 focus-visible:outline-none`}
          >
            {expanded ? (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="text-base leading-none">
                  ×
                </span>
                <span>Exit expanded view</span>
              </span>
            ) : (
              "Expand meeting"
            )}
          </button>
        </div>
      </div>

      {error ? <ErrorState description={error} /> : null}
      {notice ? (
        <p
          role="status"
          className={`${expanded ? "mx-4 mt-3 bg-white/10 text-white/80 sm:mx-6" : "text-muted bg-[#f6f8fb]"} rounded-xl px-4 py-3 text-sm`}
        >
          {notice}
        </p>
      ) : null}

      {meetingStatus === "completed" ? (
        <div className="rounded-xl bg-[#f6f8fb] px-4 py-5 text-center">
          <p className="text-ink text-sm font-medium">This meeting has ended.</p>
          <p className="text-muted mt-1 text-xs">Participants can no longer join this room.</p>
        </div>
      ) : room ? (
        <div className={expanded ? "flex min-h-0 flex-1 flex-col" : "space-y-4"}>
          <div
            className={
              expanded
                ? `grid min-h-0 flex-1 content-center gap-3 overflow-y-auto p-3 sm:p-5 ${participants.length === 1 ? "grid-cols-1 justify-items-center" : "grid-cols-1 sm:grid-cols-2 xl:grid-cols-3"}`
                : "grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            }
          >
            {participants.map((participant) => (
              <ParticipantTile
                key={participant.identity}
                participant={participant}
                expanded={expanded}
              />
            ))}
          </div>
          {!expanded
            ? participants
                .filter((participant) => !participant.isLocal)
                .map((participant) => (
                  <ParticipantAudio key={participant.identity} participant={participant} />
                ))
            : null}
          <div
            className={
              expanded
                ? "flex shrink-0 flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-[#111820] px-3 py-3 sm:px-6 sm:py-4"
                : "border-line flex flex-wrap items-center justify-center gap-2 border-t pt-4"
            }
          >
            <Button
              type="button"
              variant={isMicrophoneEnabled ? "secondary" : "primary"}
              disabled={!connected || busyControl !== null}
              aria-pressed={isMicrophoneEnabled}
              onClick={() =>
                void runRoomControl("microphone", () =>
                  room.localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled),
                )
              }
            >
              {busyControl === "microphone"
                ? "Updating microphone…"
                : isMicrophoneEnabled
                  ? "Mute microphone"
                  : "Turn microphone on"}
            </Button>
            <Button
              type="button"
              variant={isCameraEnabled ? "secondary" : "primary"}
              disabled={!connected || busyControl !== null}
              aria-pressed={isCameraEnabled}
              onClick={() =>
                void runRoomControl("camera", () =>
                  room.localParticipant.setCameraEnabled(!isCameraEnabled),
                )
              }
            >
              {busyControl === "camera"
                ? "Updating camera…"
                : isCameraEnabled
                  ? "Turn camera off"
                  : "Turn camera on"}
            </Button>
            <Button
              type="button"
              variant={isScreenShareEnabled ? "secondary" : "ghost"}
              disabled={!connected || busyControl !== null}
              aria-pressed={isScreenShareEnabled}
              onClick={() =>
                void runRoomControl("screen", () =>
                  room.localParticipant.setScreenShareEnabled(!isScreenShareEnabled),
                )
              }
            >
              {isScreenShareEnabled ? "Stop sharing" : "Share screen"}
            </Button>
            <Button type="button" variant="secondary" onClick={() => void leaveMeeting()}>
              Leave meeting
            </Button>
          </div>
          {isHost ? (
            <p
              className={`${expanded ? "text-white/55" : "text-muted"} text-center text-xs leading-5`}
            >
              {expanded
                ? "Minimize to manage recording or end the room for everyone."
                : "Use the meeting status control to end the room for everyone."}
            </p>
          ) : null}
        </div>
      ) : joining ? (
        <LoadingState label="Connecting to the meeting…" />
      ) : (
        <div
          className={`${expanded ? "flex-1 bg-transparent text-white" : "text-ink rounded-xl bg-[#f6f8fb]"} flex flex-col items-center justify-center px-5 py-8 text-center`}
        >
          <span aria-hidden="true" className="text-brand mb-3 text-2xl">
            ◉
          </span>
          <p className={`${expanded ? "text-white" : "text-ink"} text-sm font-semibold`}>
            {meetingTitle}
          </p>
          <p
            className={`${expanded ? "text-white/65" : "text-muted"} mt-1 max-w-md text-sm leading-5`}
          >
            {isHost
              ? "Joining opens the room for invited participants."
              : "Join using the invited email on your MeetFlow account."}
          </p>
          <Button
            type="button"
            className="mt-5"
            disabled={joining}
            onClick={() => void joinMeeting()}
          >
            {joining ? "Joining…" : "Join meeting"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ParticipantTile({
  participant,
  expanded,
}: {
  participant: Participant;
  expanded: boolean;
}) {
  const screenPublication = participant.getTrackPublication(Track.Source.ScreenShare);
  const cameraPublication = participant.getTrackPublication(Track.Source.Camera);
  const screenTrack = screenPublication?.isMuted ? undefined : screenPublication?.track;
  const cameraTrack = cameraPublication?.isMuted ? undefined : cameraPublication?.track;
  const videoTrack = screenTrack ?? cameraTrack;
  const name = participant.name || "MeetFlow participant";

  return (
    <div
      className={`${expanded ? "w-full max-w-6xl" : "border-line"} overflow-hidden rounded-xl border bg-[#101a24] ${expanded ? "border-white/10" : ""}`}
    >
      <div className={`${expanded ? "" : "aspect-video"} relative aspect-video`}>
        {videoTrack ? (
          <VideoTrackPreview track={videoTrack} muted={participant.isLocal} />
        ) : (
          <div className="absolute inset-0 grid place-items-center bg-[#1d2b38]">
            <span className="grid size-16 place-items-center rounded-full bg-white/10 text-xl font-semibold text-white">
              {getInitials(name)}
            </span>
          </div>
        )}
        <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-2 bg-gradient-to-t from-black/70 to-transparent px-3 pt-8 pb-3">
          <span className="min-w-0 truncate text-sm font-medium text-white">
            {name}
            {participant.isLocal ? " (you)" : ""}
          </span>
          <span className="shrink-0 text-xs text-white/75">
            {screenTrack ? "Sharing screen" : cameraTrack ? "Camera on" : "Camera off"}
          </span>
        </div>
        {participant.isSpeaking ? (
          <span className="absolute top-2 right-2 rounded-full bg-[#167d73] px-2 py-1 text-[10px] font-semibold text-white">
            Speaking
          </span>
        ) : null}
      </div>
    </div>
  );
}

function VideoTrackPreview({ track, muted }: { track: LiveKitTrack; muted: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const element = videoRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      muted={muted}
      aria-label={muted ? "Your video" : "Participant video"}
      className="absolute inset-0 size-full object-cover"
    />
  );
}

function ParticipantAudio({ participant }: { participant: Participant }) {
  const audioTrack = participant.getTrackPublication(Track.Source.Microphone)?.track;
  if (!audioTrack) return null;
  return <AudioTrackPreview track={audioTrack} />;
}

function AudioTrackPreview({ track }: { track: LiveKitTrack }) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const element = audioRef.current;
    if (!element) return;
    track.attach(element);
    return () => {
      track.detach(element);
    };
  }, [track]);

  return <audio ref={audioRef} autoPlay aria-label="Meeting participant audio" />;
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function getConnectionLabel(state: ConnectionState, joining: boolean) {
  if (joining || state === ConnectionState.Connecting) return "Connecting";
  if (state === ConnectionState.Reconnecting) return "Reconnecting";
  if (state === ConnectionState.Connected) return "Connected";
  return "Not connected";
}

function controlError(control: string) {
  if (control === "microphone") {
    return "We could not access your microphone. Check browser permissions and try again.";
  }
  if (control === "camera") {
    return "We could not access your camera. Check browser permissions and try again.";
  }
  return "Screen sharing could not start. Check browser support and try again.";
}
