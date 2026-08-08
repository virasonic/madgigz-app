import Skeleton from "@/components/ui/Skeleton";

// Mirrors FeedClient's shape: pill toggle up top, one full-height reel below.
export default function FeedLoading() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-center gap-2 p-4">
        <Skeleton className="h-9 w-24 rounded-full" />
        <Skeleton className="h-9 w-24 rounded-full" />
      </div>
      <div className="min-h-0 flex-1 px-0">
        <Skeleton className="h-full w-full rounded-none" />
      </div>
    </div>
  );
}
