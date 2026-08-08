import Skeleton from "@/components/ui/Skeleton";

// Mirrors ProfileClient's shape: avatar row, action buttons, stat cards.
export default function ProfileLoading() {
  return (
    <div className="p-4">
      <div className="mb-6 flex items-center gap-4">
        <Skeleton className="h-16 w-16 rounded-full" />
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      </div>
      <div className="mb-6 flex gap-3">
        <Skeleton className="h-12 flex-1 rounded-full" />
        <Skeleton className="h-12 flex-1 rounded-full" />
      </div>
      <div className="grid grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
