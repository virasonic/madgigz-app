import Image from "next/image";
import Link from "next/link";
import RoleCard from "@/components/ui/RoleCard";
import { safeNext } from "@/lib/site";

function HeartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 20.5s-7.5-4.6-10-9.3C.5 8 2 4.5 5.5 4c2-.3 3.7.6 5 2.3C11.8 4.6 13.5 3.7 15.5 4c3.5.5 5 4 3.5 7.2-2.5 4.7-10 9.3-10 9.3Z"
        fill="currentColor"
      />
    </svg>
  );
}

function NoteIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle cx="8" cy="17" r="3" fill="currentColor" />
      <circle cx="16" cy="14" r="3" fill="currentColor" />
      <path
        d="M11 17V5l8-2v10"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default async function LandingPage({ searchParams }: PageProps<"/">) {
  // Carried through from a shared event link: someone arrived at /e/<id>, had
  // no account, and picked "Create a MadGigz account". Every onward link here
  // has to relay it or the gig they were sent is lost at the first hop.
  const next = safeNext(((await searchParams).next as string) ?? null);
  const withNext = (path: string) =>
    next ? `${path}${path.includes("?") ? "&" : "?"}next=${encodeURIComponent(next)}` : path;

  // justify-center balances the whole group in the middle of the screen. The
  // wordmark block deliberately has no flex-1: giving it one made it absorb
  // all the spare height, pinning the logo to the top and the cards to the
  // bottom with a dead gap between them.
  return (
    <div className="flex flex-1 flex-col justify-center">
      <div className="flex flex-col items-center text-center">
        <Image
          src="/logos/madgigz-wordmark.png"
          alt="MadGigz"
          width={280}
          height={89}
          priority
          className="w-56"
        />
        <p className="mt-3 font-heading text-sm uppercase tracking-[0.2em] text-muted">
          Local Gigs &amp; Concerts
        </p>
      </div>

      <div className="mt-10 flex flex-col gap-4">
        <RoleCard
          role="fan"
          href={withNext("/signup?role=fan")}
          icon={<span className="text-foreground"><HeartIcon /></span>}
          title="I'm a Fan"
          description="Discover events, buy tickets, vibe out"
        />
        <RoleCard
          role="artist"
          href={withNext("/signup?role=artist")}
          icon={<span className="text-accent"><NoteIcon /></span>}
          title="I'm an Artist"
          description="Claim your profile, sell your shows"
          badge="Artist"
        />
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href={withNext("/signin")} className="font-heading text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
