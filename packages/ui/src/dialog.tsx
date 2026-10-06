"use client";

import { useEffect, useId, useRef } from "react";
import type { ReactNode, SyntheticEvent } from "react";

import { Button } from "./button";

export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      className="border-line text-ink backdrop:bg-ink/30 m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border bg-white p-0 shadow-[0_24px_80px_rgba(25,37,54,0.22)]"
    >
      <div className="border-line flex items-start justify-between gap-4 border-b px-5 py-4 sm:px-6">
        <div>
          <h2 id={titleId} className="text-base font-semibold">
            {title}
          </h2>
          {description ? (
            <p id={descriptionId} className="text-muted mt-1 text-sm leading-5">
              {description}
            </p>
          ) : null}
        </div>
        <Button variant="ghost" size="sm" aria-label="Close dialog" onClick={onClose}>
          ×
        </Button>
      </div>
      <div className="px-5 py-5 sm:px-6">{children}</div>
    </dialog>
  );
}
