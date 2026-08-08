// Placeholder block for loading states. Pulsing surface-colored shapes read as
// "the app responded instantly and content is on its way", which is the whole
// point of the loading.tsx files - without them, tapping a tab does nothing
// visible until the server round-trip completes.
export default function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface ${className}`} />;
}
