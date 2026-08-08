import Skeleton from "@/components/ui/Skeleton";

// Mirrors SavedClient's shape: heading, sub-tab pill, event rows.
export default function SavedLoading() {
  return (
    <div className="p-4">
      <Skeleton className="mb-4 h-8 w-28" />
      <Skeleton className="mb-5 h-11 w-full rounded-full" />
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
