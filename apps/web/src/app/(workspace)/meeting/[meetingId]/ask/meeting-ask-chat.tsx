"use client";

import { useState, type FormEvent } from "react";

import { Button, Card } from "@meetflow/ui";

type Answer = {
  answer: string;
  foundInMeeting: boolean;
  sources: { id: string; label: string; excerpt: string }[];
};

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  answer?: Answer;
};

const suggestions = [
  "What did we decide?",
  "What tasks were assigned and to whom?",
  "What deadlines did we agree on?",
];

export function MeetingAskChat({ meetingId }: { meetingId: string }) {
  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [privacyConfirmed, setPrivacyConfirmed] = useState(false);

  async function ask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const currentQuestion = question.trim();
    if (!currentQuestion || busy || !privacyConfirmed) return;

    setBusy(true);
    setError(null);
    setQuestion("");
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: currentQuestion,
    };
    setMessages((current) => [...current, userMessage].slice(-16));

    try {
      const response = await fetch(`/api/meetings/${meetingId}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: currentQuestion, privacyConfirmed: true }),
      });
      const payload = (await response.json()) as { answer?: Answer; error?: string };
      if (!response.ok || !payload.answer) {
        setError(payload.error ?? "We could not answer that question. Please try again.");
        setQuestion(currentQuestion);
        return;
      }

      const answer = payload.answer;
      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: answer.answer,
        answer,
      };
      setMessages((current) => [...current, assistantMessage].slice(-16));
    } catch {
      setError(
        "We could not reach the meeting question service. Check your connection and try again.",
      );
      setQuestion(currentQuestion);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div
        className="max-h-[min(60vh,620px)] min-h-72 space-y-5 overflow-y-auto p-4 sm:p-6"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {messages.length === 0 ? (
          <div className="flex min-h-60 flex-col justify-center">
            <h2 className="text-ink text-base font-semibold">Ask a question about the meeting</h2>
            <p className="text-muted mt-2 max-w-xl text-sm leading-6">
              MeetFlow checks the saved transcript and analysis. If the meeting does not contain an
              answer, it will say so.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => setQuestion(suggestion)}
                  className="border-line text-muted hover:text-ink focus-visible:ring-brand min-h-9 rounded-full border px-3 text-left text-xs transition-colors focus-visible:ring-2 focus-visible:outline-none"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={
                message.role === "user" ? "ml-auto max-w-[90%] sm:max-w-[80%]" : "max-w-full"
              }
            >
              <p className="text-muted mb-1 text-xs font-semibold">
                {message.role === "user" ? "You" : "MeetFlow AI"}
              </p>
              <div
                className={
                  message.role === "user"
                    ? "bg-brand-soft text-ink rounded-2xl rounded-tr-sm px-4 py-3 text-sm leading-6 whitespace-pre-wrap"
                    : "text-ink text-sm leading-6 whitespace-pre-wrap"
                }
              >
                {message.content}
              </div>
              {message.answer?.sources.length ? (
                <ul className="mt-3 space-y-2">
                  {message.answer.sources.map((source, index) => (
                    <li
                      key={`${message.id}-${source.id}-${index}`}
                      className="border-line rounded-xl border bg-[#f8fafc] px-3 py-2.5"
                    >
                      <p className="text-muted text-xs font-semibold">Source · {source.label}</p>
                      <p className="text-muted mt-1 text-xs leading-5">“{source.excerpt}”</p>
                    </li>
                  ))}
                </ul>
              ) : null}
            </article>
          ))
        )}
        {busy ? (
          <p role="status" className="text-muted text-sm">
            Checking the meeting sources…
          </p>
        ) : null}
      </div>

      <form onSubmit={ask} className="border-line border-t bg-[#fbfcfd] p-4 sm:p-5">
        <label htmlFor="meeting-question" className="text-ink mb-2 block text-sm font-medium">
          Your question
        </label>
        <textarea
          id="meeting-question"
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          maxLength={1_200}
          rows={3}
          placeholder="Ask what was discussed, decided, or assigned…"
          className="border-line text-ink placeholder:text-muted focus:border-brand focus:ring-brand w-full resize-y rounded-xl border bg-white px-3.5 py-3 text-sm leading-6 focus:ring-2 focus:ring-offset-1 focus:outline-none"
          disabled={busy}
        />
        <label className="border-line mt-4 flex cursor-pointer items-start gap-3 rounded-xl border bg-white p-3.5 text-xs leading-5">
          <input
            type="checkbox"
            checked={privacyConfirmed}
            onChange={(event) => setPrivacyConfirmed(event.target.checked)}
            className="border-line text-brand focus:ring-brand mt-0.5 size-4 shrink-0 rounded"
          />
          <span className="text-muted">
            I understand that my question and meeting excerpts will be sent to Google Gemini. If the
            configured project uses unpaid services, Google may use submitted content to provide,
            improve, and develop its products and services. See the{" "}
            <a
              href="https://ai.google.dev/gemini-api/terms"
              target="_blank"
              rel="noreferrer"
              className="text-brand underline underline-offset-2"
            >
              Gemini API terms
            </a>
            .
          </span>
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-muted text-xs">{question.length}/1,200 characters</p>
          <Button
            type="submit"
            size="sm"
            disabled={busy || question.trim().length === 0 || !privacyConfirmed}
          >
            {busy ? "Thinking…" : "Ask question"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="mt-3 rounded-lg bg-[#fff5df] px-3 py-2 text-sm text-[#76551b]">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
