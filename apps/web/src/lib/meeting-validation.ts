import { z } from "zod";

const inviteesSchema = z
  .string()
  .max(4096, "Use at most 20 email addresses.")
  .transform((value) => [
    ...new Set(
      value
        .split(/[,;\n\r]+/)
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean),
    ),
  ])
  .pipe(z.array(z.string().max(254).email("Enter valid email addresses.")).max(20));

export const createMeetingSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "Enter a meeting title.")
    .max(180, "Title must be 180 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5,000 characters or fewer.")
    .transform((value) => value || null),
  invitees: inviteesSchema,
});

export const meetingStatusUpdateSchema = z.object({
  meetingId: z.string().uuid(),
  status: z.enum(["active", "completed"]),
});
