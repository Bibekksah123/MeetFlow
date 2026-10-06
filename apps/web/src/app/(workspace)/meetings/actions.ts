"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { meetingParticipants, meetings, withUserDatabase } from "@meetflow/db";

import { requireUser } from "@/lib/auth";
import { createLiveKitRoomServiceClient } from "@/lib/livekit/server";
import { createMeetingSchema, meetingStatusUpdateSchema } from "@/lib/meeting-validation";
import { stopActiveMeetingRecording } from "@/lib/recordings";

export type MeetingActionState = {
  error: string | null;
  success: string | null;
  warning?: string | null;
};

export async function createMeetingAction(
  _previousState: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const parsed = createMeetingSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") ?? "",
    invitees: formData.get("invitees") ?? "",
  });

  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? "Review the meeting details and try again.",
      success: null,
    };
  }

  const user = await requireUser();
  let meetingId: string;

  try {
    meetingId = await withUserDatabase(user.id, async (transaction) => {
      const [meeting] = await transaction
        .insert(meetings)
        .values({
          ownerId: user.id,
          title: parsed.data.title,
          description: parsed.data.description,
        })
        .returning({ id: meetings.id });

      if (!meeting) throw new Error("Meeting insert returned no ID.");

      if (parsed.data.invitees.length > 0) {
        await transaction.insert(meetingParticipants).values(
          parsed.data.invitees.map((inviteeEmail) => ({
            meetingId: meeting.id,
            inviteeEmail,
            invitedBy: user.id,
          })),
        );
      }

      return meeting.id;
    });
  } catch (error) {
    // Keep diagnostics useful without logging SQL, meeting contents, or connection details.
    console.error("Meeting creation failed.", {
      ...getErrorDiagnostics(error),
      databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    });
    return { error: "We could not create this meeting. Please try again.", success: null };
  }

  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  redirect(`/meeting/${meetingId}`);
}

export async function updateMeetingStatusAction(
  _previousState: MeetingActionState,
  formData: FormData,
): Promise<MeetingActionState> {
  const parsed = meetingStatusUpdateSchema.safeParse({
    meetingId: formData.get("meetingId"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    return { error: "That meeting update is not valid.", success: null };
  }

  const user = await requireUser();
  const expectedStatus = parsed.data.status === "active" ? "scheduled" : "active";
  const statusValues =
    parsed.data.status === "active"
      ? { status: "active" as const, startedAt: new Date() }
      : { status: "completed" as const, endedAt: new Date() };

  try {
    const updated = await withUserDatabase(user.id, (transaction) =>
      transaction
        .update(meetings)
        .set(statusValues)
        .where(
          and(
            eq(meetings.id, parsed.data.meetingId),
            eq(meetings.ownerId, user.id),
            eq(meetings.status, expectedStatus),
          ),
        )
        .returning({ id: meetings.id }),
    );

    if (updated.length === 0) {
      return {
        error: "Only the meeting host can make that status change. Refresh and try again.",
        success: null,
      };
    }
  } catch (error) {
    console.error("Meeting status update failed.", { code: getErrorCode(error) });
    return { error: "We could not update this meeting. Please try again.", success: null };
  }

  let completionWarning: string | null = null;
  if (parsed.data.status === "completed") {
    try {
      const recordingStop = await stopActiveMeetingRecording(user.id, parsed.data.meetingId);
      if (recordingStop === "check-needed") {
        completionWarning = "Meeting ended. The recording is still being checked.";
      }
    } catch (error) {
      console.error("Meeting recording stop during completion failed.", {
        code: getErrorCode(error),
      });
      completionWarning = "Meeting ended. The recording is still being checked.";
    }

    try {
      await createLiveKitRoomServiceClient().deleteRoom(parsed.data.meetingId);
    } catch (error) {
      if (!isNotFoundError(error)) {
        console.error("LiveKit room end failed.", { code: getErrorCode(error) });
        const roomWarning =
          "LiveKit could not disconnect everyone. Ask remaining participants to leave the room.";
        completionWarning = completionWarning
          ? `${completionWarning} ${roomWarning}`
          : `Meeting marked complete, but ${roomWarning.toLowerCase()}`;
      }
    }
  }

  revalidatePath(`/meeting/${parsed.data.meetingId}`);
  revalidatePath("/meetings");
  revalidatePath("/dashboard");
  return {
    error: null,
    success: parsed.data.status === "active" ? "Meeting marked active." : "Meeting completed.",
    warning: completionWarning,
  };
}

function getErrorCode(error: unknown): string {
  return getErrorDiagnostics(error).code;
}

function getErrorDiagnostics(error: unknown): { code: string; errorTypes: string[] } {
  const errorTypes: string[] = [];
  let code: string | undefined;
  let current = error;

  for (let depth = 0; depth < 4 && typeof current === "object" && current !== null; depth += 1) {
    if ("name" in current && typeof current.name === "string") errorTypes.push(current.name);
    if (!code && "code" in current && typeof current.code === "string") code = current.code;
    current = "cause" in current ? current.cause : undefined;
  }

  return { code: code ?? "UNKNOWN", errorTypes: [...new Set(errorTypes)] };
}

function isNotFoundError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "status" in error && error.status === 404;
}
