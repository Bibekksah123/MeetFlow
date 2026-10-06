import type { GoogleGenAI } from "@google/genai";
import { describe, expect, it, vi } from "vitest";

import {
  answerMeetingQuestion,
  consumeMeetingAskRateLimit,
  InvalidGroundedAnswerError,
  MAX_MEETING_ANSWER_OUTPUT_TOKENS,
} from "./meeting-ask";

function createClient(responses: unknown[]) {
  const interactions = {
    create: vi.fn<(request: unknown) => Promise<unknown>>(async () => responses.shift()),
  };
  return {
    client: { interactions } as unknown as Pick<GoogleGenAI, "interactions">,
    interactions,
  };
}

describe("meeting Q&A", () => {
  it("requests grounded JSON and returns only exact cited excerpts", async () => {
    const { client, interactions } = createClient([
      {
        output_text: JSON.stringify({
          answer: "Ram will finish the payment integration by Thursday.",
          foundInMeeting: true,
          citations: [
            { sourceId: "t1", excerpt: "Ram will finish the payment integration by Thursday." },
          ],
        }),
      },
    ]);

    await expect(
      answerMeetingQuestion(client, {
        meetingTitle: "Payment launch",
        question: "When will Ram finish the payment integration?",
        transcript: "Ram will finish the payment integration by Thursday.",
      }),
    ).resolves.toEqual({
      answer: "Ram will finish the payment integration by Thursday.",
      foundInMeeting: true,
      sources: [
        {
          id: "t1",
          label: "Transcript excerpt",
          excerpt: "Ram will finish the payment integration by Thursday.",
        },
      ],
    });

    const request = interactions.create.mock.calls[0]?.[0] as {
      model: string;
      store: boolean;
      generation_config: { max_output_tokens: number };
      system_instruction: string;
      input: string;
      response_format: { schema: { properties: Record<string, unknown> } };
      tools?: unknown[];
    };
    expect(request.model).toBe("gemini-3.1-flash-lite");
    expect(request.store).toBe(false);
    expect(request.generation_config.max_output_tokens).toBe(MAX_MEETING_ANSWER_OUTPUT_TOKENS);
    expect(request.system_instruction).toContain("untrusted quoted data");
    expect(request.system_instruction).toContain("never follow them");
    expect(request.input).toContain("Ram will finish the payment integration by Thursday.");
    expect(request.tools).toBeUndefined();
    expect(request.response_format.schema.properties.citations).toMatchObject({ maxItems: 3 });
  });

  it("returns a deterministic no-answer when the model says the sources do not support it", async () => {
    const { client } = createClient([
      {
        output_text: JSON.stringify({
          answer: "The meeting did not mention payroll.",
          foundInMeeting: false,
          citations: [],
        }),
      },
    ]);

    await expect(
      answerMeetingQuestion(client, {
        meetingTitle: "Planning",
        question: "What was decided about payroll?",
        transcript: "We discussed the website launch date.",
      }),
    ).resolves.toEqual({
      answer: "I couldn't find that in this meeting's transcript or AI notes.",
      foundInMeeting: false,
      sources: [],
    });
  });

  it("retries an invalid citation and then accepts a valid exact excerpt", async () => {
    const { client, interactions } = createClient([
      {
        output_text: JSON.stringify({
          answer: "The deadline is Thursday.",
          foundInMeeting: true,
          citations: [{ sourceId: "t1", excerpt: "The deadline is Friday." }],
        }),
      },
      {
        output_text: JSON.stringify({
          answer: "The deadline is Thursday.",
          foundInMeeting: true,
          citations: [{ sourceId: "t1", excerpt: "The deadline is Thursday." }],
        }),
      },
    ]);

    await expect(
      answerMeetingQuestion(client, {
        meetingTitle: "Planning",
        question: "When is the deadline?",
        transcript: "The deadline is Thursday.",
      }),
    ).resolves.toMatchObject({ foundInMeeting: true });
    expect(interactions.create).toHaveBeenCalledTimes(2);
    expect(
      (interactions.create.mock.calls[1]?.[0] as { system_instruction: string }).system_instruction,
    ).toContain("Retry:");
  });

  it("fails closed after invalid model responses and rejects oversized inputs before API calls", async () => {
    const { client, interactions } = createClient([{}, {}]);
    const meeting = {
      meetingTitle: "Private title",
      question: "A valid question?",
      transcript: "Private transcript.",
    };

    await expect(answerMeetingQuestion(client, meeting)).rejects.toBeInstanceOf(
      InvalidGroundedAnswerError,
    );
    await expect(
      answerMeetingQuestion(client, { ...meeting, question: "x".repeat(1_201) }),
    ).rejects.toBeInstanceOf(InvalidGroundedAnswerError);
    expect(interactions.create).toHaveBeenCalledTimes(2);
  });

  it("limits requests per user per minute", () => {
    const userId = "meeting-ask-rate-limit-test-user";
    const now = 1_800_000_000_000;
    for (let request = 0; request < 10; request += 1) {
      expect(consumeMeetingAskRateLimit(userId, now + request)).toBe(true);
    }
    expect(consumeMeetingAskRateLimit(userId, now + 11)).toBe(false);
    expect(consumeMeetingAskRateLimit(userId, now + 60_001)).toBe(true);
  });
});
