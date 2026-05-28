export default function LoadingSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="h-72 animate-pulse rounded-lg border border-slate-200 bg-white p-4">
          <div className="h-32 rounded-md bg-slate-100" />
          <div className="mt-4 h-5 w-2/3 rounded bg-slate-100" />
          <div className="mt-3 h-4 w-full rounded bg-slate-100" />
          <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </>
  );
}
