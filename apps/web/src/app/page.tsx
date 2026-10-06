import Link from "next/link";
import { redirect } from "next/navigation";

import { Badge, buttonStyles, Card } from "@meetflow/ui";

import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  let user = null;
  try {
    user = await getCurrentUser();
  } catch {
    // Keep the public page available if the auth service is temporarily unavailable.
  }
  if (user) redirect("/dashboard");

  return (
    <div className="bg-canvas min-h-screen">
      <header className="border-line flex h-16 items-center justify-between border-b bg-white px-4 sm:px-7">
        <Link href="/" className="text-ink text-lg font-semibold tracking-[-0.04em]">
          MeetFlow
        </Link>
        <nav aria-label="Account navigation" className="flex items-center gap-2">
          <Link href="/login" className={buttonStyles({ variant: "ghost", size: "sm" })}>
            Log in
          </Link>
          <Link href="/signup" className={buttonStyles({ size: "sm" })}>
            Create account
          </Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl space-y-8 px-4 pt-7 pb-10 sm:px-7 sm:pt-9 lg:px-10">
        <section className="border-line flex flex-col justify-between gap-6 border-b pb-7 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <p className="text-brand mb-3 text-xs font-semibold tracking-[0.16em] uppercase">
              AI meeting notes with human approval
            </p>
            <h1 className="text-ink text-3xl leading-tight font-semibold tracking-[-0.04em] sm:text-4xl">
              Turn meetings into work that gets done.
            </h1>
            <p className="text-muted mt-3 max-w-xl text-base leading-7">
              Record with consent, get a transcript and clear decisions, then review suggested tasks
              before anything moves to another tool.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <Link
              href="/signup"
              className={buttonStyles({ className: "w-full whitespace-nowrap sm:w-auto" })}
            >
              Create your account
            </Link>
            <Link
              href="#how-it-works"
              className={buttonStyles({ variant: "secondary", className: "w-full sm:w-auto" })}
            >
              See how it works
            </Link>
          </div>
        </section>

        <section
          id="how-it-works"
          aria-label="How MeetFlow works"
          className="grid gap-3 sm:grid-cols-3"
        >
          <WorkflowStep
            number="01"
            title="Meet"
            description="Create a room and record with consent."
          />
          <WorkflowStep
            number="02"
            title="Understand"
            description="Get a transcript, summary, and decisions."
          />
          <WorkflowStep
            number="03"
            title="Follow through"
            description="Review suggested tasks and approve next steps."
          />
        </section>

        <section className="grid gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.8fr)]">
          <Card className="overflow-hidden">
            <div className="border-line flex items-center justify-between border-b px-5 py-4 sm:px-6">
              <div>
                <h2 className="text-ink text-base font-semibold">
                  One clear record after the call
                </h2>
                <p className="text-muted mt-1 text-sm">
                  Keep the conversation and what comes next together.
                </p>
              </div>
              <Badge variant="neutral">Meeting follow-through</Badge>
            </div>
            <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
              <Outcome title="Summary" description="The main points, in a few lines." />
              <Outcome title="Decisions" description="What the group agreed to do." />
              <Outcome
                title="Tasks to review"
                description="Owners and deadlines for your approval."
              />
            </div>
          </Card>

          <Card className="flex flex-col">
            <div className="border-line border-b px-5 py-4 sm:px-6">
              <h2 className="text-ink text-base font-semibold">You stay in control</h2>
              <p className="text-muted mt-1 text-sm">AI suggestions are yours to review.</p>
            </div>
            <div className="flex flex-1 flex-col items-start justify-center px-5 py-7 sm:px-6">
              <p className="text-muted text-sm leading-6">
                Approve the tasks you want to act on. MeetFlow won’t send them to another tool
                without your approval.
              </p>
              <Link
                href="/signup"
                className={`mt-5 ${buttonStyles({ variant: "ghost", size: "sm" })}`}
              >
                Get started <span aria-hidden="true">→</span>
              </Link>
            </div>
          </Card>
        </section>

        <section className="flex flex-col gap-4 rounded-2xl border border-[#cfe4df] bg-[#eef7f5] p-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="text-ink text-sm font-semibold">Start with your next meeting</h2>
            <p className="text-muted mt-1 max-w-2xl text-sm leading-6">
              Bring the conversation, decisions, and approved work into one place.
            </p>
          </div>
          <Link
            href="/signup"
            className="text-brand hover:text-brand-dark shrink-0 text-sm font-semibold"
          >
            Create your account <span aria-hidden="true">→</span>
          </Link>
        </section>
      </main>
    </div>
  );
}

function Outcome({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-line rounded-xl border bg-[#fbfcfd] px-4 py-4">
      <h3 className="text-ink text-sm font-semibold">{title}</h3>
      <p className="text-muted mt-1 text-sm leading-5">{description}</p>
    </div>
  );
}

function WorkflowStep({
  number,
  title,
  description,
}: {
  number: string;
  title: string;
  description: string;
}) {
  return (
    <div className="border-line flex items-start gap-3 rounded-xl border bg-white px-4 py-4">
      <span className="text-brand mt-0.5 text-xs font-semibold tracking-wide">{number}</span>
      <div>
        <h2 className="text-ink text-sm font-semibold">{title}</h2>
        <p className="text-muted mt-1 text-sm">{description}</p>
      </div>
    </div>
  );
}
