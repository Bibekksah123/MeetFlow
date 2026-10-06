import { and, eq, isNull, sql } from "drizzle-orm";

import { meetingParticipants, meetings, withUserDatabase } from "@meetflow/db";

export type MeetingJoinResult =
  | { kind: "not-found" }
  | { kind: "ended" }
  | { kind: "forbidden" }
  | { kind: "allowed"; isHost: boolean };

export function authorizeMeetingJoin(options: {
  userId: string;
  meetingId: string;
  verifiedEmail: string | null;
}): Promise<MeetingJoinResult> {
  const normalizedEmail = options.verifiedEmail?.trim().toLowerCase() || null;

  return withUserDatabase(
    options.userId,
    async (transaction) => {
      const [meeting] = await transaction
        .select({
          id: meetings.id,
          ownerId: meetings.ownerId,
          status: meetings.status,
        })
        .from(meetings)
        .where(eq(meetings.id, options.meetingId))
        .limit(1);

      if (!meeting) return { kind: "not-found" };
      if (meeting.status === "completed") return { kind: "ended" };

      const isHost = meeting.ownerId === options.userId;
      if (!isHost) {
        const invitations = await transaction
          .select({
            id: meetingParticipants.id,
            userId: meetingParticipants.userId,
            inviteeEmail: meetingParticipants.inviteeEmail,
            status: meetingParticipants.status,
          })
          .from(meetingParticipants)
          .where(eq(meetingParticipants.meetingId, options.meetingId))
          .limit(100);

        const invitation = invitations.find(
          (candidate) =>
            (candidate.userId === options.userId && candidate.status === "accepted") ||
            (normalizedEmail !== null &&
              candidate.inviteeEmail?.trim().toLowerCase() === normalizedEmail &&
              candidate.status === "invited" &&
              candidate.userId === null),
        );

        if (!invitation) return { kind: "forbidden" };

        const alreadyAccepted =
          invitation.userId === options.userId && invitation.status === "accepted";

        if (!alreadyAccepted) {
          const [accepted] = await transaction
            .update(meetingParticipants)
            .set({ userId: options.userId, status: "accepted" })
            .where(
              and(
                eq(meetingParticipants.id, invitation.id),
                eq(meetingParticipants.status, "invited"),
                isNull(meetingParticipants.userId),
                sql`lower(${meetingParticipants.inviteeEmail}) = ${normalizedEmail}`,
              ),
            )
            .returning({ id: meetingParticipants.id });

          if (!accepted) return { kind: "forbidden" };
        }
      }

      if (isHost && meeting.status === "scheduled") {
        await transaction
          .update(meetings)
          .set({ status: "active", startedAt: new Date() })
          .where(
            and(
              eq(meetings.id, meeting.id),
              eq(meetings.ownerId, options.userId),
              eq(meetings.status, "scheduled"),
            ),
          );
      }

      return { kind: "allowed", isHost };
    },
    { email: normalizedEmail },
  );
}
