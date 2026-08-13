// Shown instantly while the notifications page does its per-request fetch (#133).
// Without a loading.tsx the App Router keeps the *previous* screen frozen on the
// wire until the server render finishes, which on the native shell read as "the
// bell is slow". This Suspense fallback paints on tap so the navigation feels
// immediate; the real list swaps in when the fetch lands. Server component (no
// hooks) so it can be the boundary fallback — a skeleton needs no copy.
export default function NotificationsLoading() {
  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl" aria-hidden="true">
      <div className="mb-6 flex items-center gap-3">
        <div className="h-9 w-9 shrink-0 rounded-full bg-surface" />
        <div className="h-7 w-40 rounded-lg bg-surface" />
      </div>

      <div className="flex flex-col gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-2xl bg-surface/60 p-3"
            style={{ opacity: 1 - i * 0.13 }}
          >
            <div className="h-11 w-11 shrink-0 rounded-full bg-surface animate-pulse" />
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="h-3.5 w-2/3 rounded bg-surface animate-pulse" />
              <div className="h-3 w-1/3 rounded bg-surface animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
