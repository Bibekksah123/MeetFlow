export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-label={label}
      className="text-muted flex items-center gap-3 py-4 text-sm"
    >
      <span
        aria-hidden="true"
        className="border-t-brand size-4 animate-spin rounded-full border-2 border-[#d9e2e6]"
      />
      <span>{label}…</span>
    </div>
  );
}
