import { buildSocialLinks, type SocialSource } from "@/lib/socials";

export default function SocialLinks({
  source,
  className = "",
}: {
  source: SocialSource;
  className?: string;
}) {
  const links = buildSocialLinks(source);
  if (links.length === 0) return null;

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {links.map((link) => (
        <a
          key={link.label}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-full border border-muted/30 px-3 py-1.5 text-xs font-heading text-foreground"
        >
          {link.label}
        </a>
      ))}
    </div>
  );
}
