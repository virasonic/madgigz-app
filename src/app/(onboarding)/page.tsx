import Image from "next/image";
import Link from "next/link";
import RoleCard from "@/components/ui/RoleCard";

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

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5 11a7 7 0 0 0 14 0M12 18v4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function LandingPage() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="mt-8 flex flex-1 flex-col items-center text-center">
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

      <div className="flex flex-col gap-4">
        <RoleCard
          role="fan"
          href="/signup?role=fan"
          icon={<span className="text-foreground"><HeartIcon /></span>}
          title="I'm a Fan"
          description="Discover events, buy tickets, vibe out"
        />
        <RoleCard
          role="artist"
          href="/signup?role=artist"
          icon={<span className="text-accent"><MicIcon /></span>}
          title="I'm an Artist"
          description="Claim your profile, sell your shows"
          badge="Artist"
        />
      </div>

      <p className="mt-8 text-center text-sm text-muted">
        Already have an account?{" "}
        <Link href="/signin" className="font-heading text-foreground">
          Sign in
        </Link>
      </p>
    </div>
  );
}
