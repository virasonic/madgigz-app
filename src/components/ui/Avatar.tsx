// Shared "photo or initial letter" rendering - used on an artist's own
// profile header and on their public page, so the fallback logic (and what
// counts as "no photo yet") only lives in one place.
export default function Avatar({
  photoUrl,
  name,
  size = 64,
}: {
  photoUrl: string | null;
  name: string;
  size?: number;
}) {
  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary font-display text-foreground"
      style={{ width: size, height: size, fontSize: size * 0.35 }}
    >
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- remote Supabase Storage URL, arbitrary dimensions per call site
        <img src={photoUrl} alt={name} className="h-full w-full object-cover" />
      ) : (
        name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}
