export function hasUnmutedMediaTrack(
  participants: ReadonlyArray<{ tracks: ReadonlyArray<{ muted: boolean }> }>,
) {
  return participants.some((participant) => participant.tracks.some((track) => !track.muted));
}
