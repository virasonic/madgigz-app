import Link from "next/link";
import { ReactNode } from "react";

type Role = "fan" | "artist";

const roleStyles: Record<Role, string> = {
  fan: "bg-gradient-to-br from-primary to-primary-dark",
  artist: "bg-surface-raised border border-accent-dark",
};

interface RoleCardProps {
  role: Role;
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
  badge?: string;
}

export default function RoleCard({
  role,
  href,
  icon,
  title,
  description,
  badge,
}: RoleCardProps) {
  return (
    <Link
      href={href}
      className={`relative block rounded-3xl p-6 transition-transform duration-150 active:scale-[0.98] ${roleStyles[role]}`}
    >
      {badge && (
        <span className="absolute right-6 top-6 rounded-full bg-black/25 px-3 py-1 text-xs font-heading uppercase tracking-wide text-foreground">
          {badge}
        </span>
      )}
      <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-black/20">
        {icon}
      </div>
      <h3 className="font-display text-2xl text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-foreground/80">{description}</p>
    </Link>
  );
}
