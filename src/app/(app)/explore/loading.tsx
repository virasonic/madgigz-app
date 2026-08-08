import Skeleton from "@/components/ui/Skeleton";

// Mirrors ExploreClient's shape: heading, search bar, 2-column poster grid.
export default function ExploreLoading() {
  return (
    <div className="p-4">
      <Skeleton className="mb-4 h-8 w-32" />
      <Skeleton className="mb-5 h-12 w-full" />
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[3/4] w-full" />
        ))}
      </div>
    </div>
  );
}
