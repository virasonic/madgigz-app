import Skeleton from "@/components/ui/Skeleton";

// Mirrors FriendsClient's shape: heading, a poster rail, friend rows.
export default function FriendsLoading() {
  return (
    <div className="p-4">
      <Skeleton className="mb-5 h-8 w-32" />
      <Skeleton className="mb-2 h-4 w-40" />
      <div className="mb-6 flex gap-3">
        <Skeleton className="aspect-[3/4] w-36" />
        <Skeleton className="aspect-[3/4] w-36" />
      </div>
      <Skeleton className="mb-2 h-4 w-28" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    </div>
  );
}
