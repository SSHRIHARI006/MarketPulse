export function LoadingBlock({ label = 'Loading market data…', rows = 3 }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-live="polite">
      <p className="text-xs text-slate-500">{label}</p>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="h-3 animate-pulse rounded bg-slate-800/70"
          style={{ width: `${92 - index * 12}%` }}
        />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-rose-900/60 bg-rose-950/30 p-4" role="alert">
      <p className="text-xs font-semibold uppercase tracking-wide text-rose-300">Could not load data</p>
      <p className="text-xs text-rose-200/80">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-ghost w-fit" onClick={() => onRetry()}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function EmptyBlock({ message = 'No data available yet.', hint }) {
  return (
    <div className="p-4">
      <p className="text-xs text-slate-400">{message}</p>
      {hint ? <p className="mt-1 text-[11px] text-slate-600">{hint}</p> : null}
    </div>
  );
}
