import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import {
  analyzeMeetingTranscript,
  AnalysisTranscriptTooLargeError,
  InvalidMeetingAnalysisError,
  MAX_ANALYSIS_OUTPUT_TOKENS,
  MAX_ANALYSIS_TRANSCRIPT_CHARACTERS,
  MEETING_ANALYSIS_MODEL,
} from "./analysis";

const validAnalysis = {
  summary: "The team agreed to finish the payment integration this week.",
  keyPoints: ["The payment flow is the current blocker."],
  decisions: [
    {
      title: "Complete the payment integration first",
      details: "The team prioritized payments ahead of the landing page.",
      sourceContext: "Let's finish payments first.",
    },
  ],
  actionItems: [
    {
      title: "Finish payment integration",
      description: "Complete the checkout integration.",
      assignee: "Ram",
      deadline: "2026-10-08T00:00:00.000Z",
      priority: "high",
      sourceContext: "Ram, please finish it by Thursday.",
      confidence: 0.92,
    },
  ],
  openQuestions: ["Should the team support recurring payments?"],
  risks: ["The provider sandbox has been unreliable."],
  followUp: ["Confirm the production credentials before release."],
};

function createClient(responses: unknown[]) {
  const interactions = {
    create: vi.fn<(request: unknown) => Promise<unknown>>(async () => responses.shift()),
  };
  return {
    client: { interactions } as unknown as Pick<GoogleGenAI, "interactions">,
    interactions,
  };
}

describe("meeting transcript analysis", () => {
  it("requests schema-constrained analysis and validates every returned field", async () => {
    const { client, interactions } = createClient([{ output_text: JSON.stringify(validAnalysis) }]);

    await expect(
      analyzeMeetingTranscript(client, {
        meetingTitle: "Payment launch",
        meetingDate: new Date("2026-10-01T14:00:00.000Z"),
        transcript: "Let's finish payments first. Ram, please finish it by Thursday.",
      }),
    ).resolves.toEqual(validAnalysis);

    const request = interactions.create.mock.calls[0]?.[0] as {
      model: string;
      store: boolean;
      generation_config: { max_output_tokens: number };
      system_instruction: string;
      input: string;
      response_format: { mime_type: string; schema: Record<string, unknown> };
    };
    expect(request.model).toBe("gemini-3.1-flash-lite");
    expect(request.store).toBe(false);
    expect(request.generation_config.max_output_tokens).toBe(MAX_ANALYSIS_OUTPUT_TOKENS);
    expect(MEETING_ANALYSIS_MODEL).toBe("gemini-3.1-flash-lite");
    expect(request.system_instruction).toContain("untrusted quoted data");
    expect(request.system_instruction).toContain("Do not invent");
    expect(request.response_format.mime_type).toBe("application/json");
    expect(request.response_format.schema.required).toContain("actionItems");
    expect(request.response_format.schema.properties).toMatchObject({
      keyPoints: { maxItems: 20 },
      decisions: { maxItems: 30 },
      actionItems: { maxItems: 50 },
      openQuestions: { maxItems: 30 },
      risks: { maxItems: 30 },
      followUp: { maxItems: 30 },
    });
    expect(JSON.parse(request.input)).toMatchObject({
      meetingTitle: "Payment launch",
      meetingDate: "2026-10-01",
      transcript: "Let's finish payments first. Ram, please finish it by Thursday.",
    });
  });

  it("retries once when the generated JSON does not pass validation", async () => {
    const { client, interactions } = createClient([
      {
        output_text: JSON.stringify({
          ...validAnalysis,
          actionItems: [{ title: "Missing fields" }],
        }),
      },
      { output_text: JSON.stringify(validAnalysis) },
    ]);

    await expect(
      analyzeMeetingTranscript(client, {
        meetingTitle: "Payment launch",
        meetingDate: null,
        transcript: "Short synthetic transcript.",
      }),
    ).resolves.toMatchObject({ summary: validAnalysis.summary });
    expect(interactions.create).toHaveBeenCalledTimes(2);
    expect(interactions.create.mock.calls[1]?.[0]).toMatchObject({
      system_instruction: expect.stringContaining("This is a retry"),
    });
  });

  it("fails safely after two invalid model responses", async () => {
    const { client, interactions } = createClient([
      { output_text: "not json" },
      { output_text: JSON.stringify({ ...validAnalysis, summary: "" }) },
    ]);

    await expect(
      analyzeMeetingTranscript(client, {
        meetingTitle: "Private meeting title",
        meetingDate: null,
        transcript: "Private transcript contents.",
      }),
    ).rejects.toBeInstanceOf(InvalidMeetingAnalysisError);
    expect(interactions.create).toHaveBeenCalledTimes(2);
  });

  it("rejects empty and oversized transcripts before calling Gemini", async () => {
    const { client, interactions } = createClient([]);
    const input = { meetingTitle: "Meeting", meetingDate: null, transcript: "" };

    await expect(analyzeMeetingTranscript(client, input)).rejects.toBeInstanceOf(
      InvalidMeetingAnalysisError,
    );
    await expect(
      analyzeMeetingTranscript(client, {
        ...input,
        transcript: "x".repeat(MAX_ANALYSIS_TRANSCRIPT_CHARACTERS + 1),
      }),
    ).rejects.toBeInstanceOf(AnalysisTranscriptTooLargeError);
    expect(interactions.create).not.toHaveBeenCalled();
  });
});
