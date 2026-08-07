import Image from "next/image";
import Link from "next/link";

export default function FeedPlaceholderPage() {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-1 flex-col items-center justify-center gap-4 bg-background px-6 text-center">
      <Image
        src="/logos/mgz-mark.png"
        alt="MadGigz"
        width={64}
        height={46}
        className="w-16 opacity-80"
      />
      <h1 className="font-display text-2xl text-foreground">
        You&apos;re in.
      </h1>
      <p className="text-sm text-muted">
        The For You feed, tickets, and artist tools land here in Stage 2.
      </p>
      <Link href="/" className="mt-4 text-sm text-accent">
        Back to start
      </Link>
    </div>
  );
}
