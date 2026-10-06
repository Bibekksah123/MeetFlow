export function ErrorState({
  title = "Something went wrong",
  description,
}: {
  title?: string;
  description: string;
}) {
  return (
    <div role="alert" className="rounded-xl border border-[#f0c9cc] bg-[#fff7f7] px-4 py-3">
      <h2 className="text-sm font-semibold text-[#963d45]">{title}</h2>
      <p className="mt-1 text-sm leading-5 text-[#7d5155]">{description}</p>
    </div>
  );
}
