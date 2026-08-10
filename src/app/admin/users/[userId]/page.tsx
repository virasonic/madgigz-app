import Link from "next/link";
import { notFound } from "next/navigation";
import { adminClient, fetchUserDetail, requireAdmin } from "@/lib/supabase/admin-queries";
import { formatEuros } from "@/lib/pricing";

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 font-display text-2xl text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-muted/10 py-2.5 last:border-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm text-foreground">{children}</span>
    </div>
  );
}

function Pill({ tone, children }: { tone: "good" | "warn" | "flat"; children: React.ReactNode }) {
  const toneClass =
    tone === "good"
      ? "bg-accent/15 text-accent"
      : tone === "warn"
        ? "bg-primary/15 text-primary"
        : "bg-muted/15 text-muted";
  return <span className={`rounded-full px-2 py-0.5 text-xs ${toneClass}`}>{children}</span>;
}

const dmy = (value: string) => new Date(value).toLocaleDateString("en-GB");

export default async function AdminUserDetailPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  await requireAdmin();
  const { userId } = await params;
  const user = await fetchUserDetail(adminClient(), userId);
  if (!user) notFound();

  const isArtist = user.role === "artist" || user.role === "admin";

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/users" className="text-sm text-accent">
          ← All users
        </Link>

        <div className="mt-3 flex items-center gap-4">
          {/* Deliberately a plain img, not next/image: these are arbitrary
              Storage URLs and the admin panel is a handful of internal page
              views, so the optimiser earns nothing here. */}
          {user.artistPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- see above
            <img
              src={user.artistPhotoUrl}
              alt=""
              className="h-20 w-20 shrink-0 rounded-full object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface">
              <span className="font-display text-2xl text-muted">
                {user.username.slice(0, 1).toUpperCase()}
              </span>
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-2xl text-foreground">
                {user.artistName ?? user.username}
              </h1>
              <Pill tone="flat">{user.role}</Pill>
              {user.deletedAt && <Pill tone="flat">Deleted</Pill>}
              {!user.deletedAt && user.deletionRequestedAt && (
                <Pill tone="warn">Deletion requested</Pill>
              )}
              {!user.onboardingComplete && <Pill tone="warn">Signup unfinished</Pill>}
            </div>
            <p className="text-sm text-muted">
              @{user.username} · {user.email}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Tickets bought"
          value={String(user.ticketsBought)}
          hint="Excludes refunded"
        />
        <StatCard label="Attended" value={String(user.ticketsAttended)} hint="Scanned at the door" />
        <StatCard label="Spent" value={formatEuros(user.totalSpentCents)} />
        <StatCard
          label={isArtist ? "Shows created" : "Following"}
          value={String(isArtist ? user.showsCreated : user.followingCount)}
        />
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="rounded-2xl bg-surface p-5">
          <h2 className="font-heading text-sm uppercase tracking-wide text-muted">Account</h2>
          <div className="mt-3">
            <Field label="Joined">{dmy(user.createdAt)}</Field>
            <Field label="Last sign-in">
              {user.lastSignInAt ? dmy(user.lastSignInAt) : "Never"}
            </Field>
            <Field label="Sign-in methods">
              {user.providers.length ? (
                <span className="flex justify-end gap-1.5">
                  {user.providers.map((p) => (
                    <Pill key={p} tone="flat">
                      {p}
                    </Pill>
                  ))}
                </span>
              ) : (
                "—"
              )}
            </Field>
            <Field label="Email confirmed">
              {user.emailConfirmedAt ? (
                dmy(user.emailConfirmedAt)
              ) : (
                <Pill tone="warn">Not confirmed</Pill>
              )}
            </Field>
            {/* Age rather than the date of birth itself. It is collected for
                the 16+ gate, and the gate is the only question worth asking of
                it - see addendum_018 for why it is not readable anywhere else. */}
            <Field label="Age">
              {user.age === null ? (
                <Pill tone="warn">Not on file</Pill>
              ) : user.age < 16 ? (
                <Pill tone="warn">{user.age} — under 16</Pill>
              ) : (
                `${user.age}`
              )}
            </Field>
            <Field label="Followers">{user.followerCount}</Field>
            {user.deletionRequestedAt && !user.deletedAt && (
              <Field label="Deletion requested">{dmy(user.deletionRequestedAt)}</Field>
            )}
          </div>
        </section>

        {isArtist && (
          <section className="rounded-2xl bg-surface p-5">
            <h2 className="font-heading text-sm uppercase tracking-wide text-muted">Artist</h2>
            <div className="mt-3">
              <Field label="Artist name">{user.artistName ?? "—"}</Field>
              <Field label="Verification">
                {user.artistStatus === "approved" ? (
                  <Pill tone="good">Approved</Pill>
                ) : user.artistStatus === "rejected" ? (
                  <Pill tone="warn">Rejected</Pill>
                ) : user.artistStatus ? (
                  <Pill tone="warn">Pending</Pill>
                ) : (
                  "—"
                )}
              </Field>
              <Field label="Evidence">
                {user.evidenceSubmitted ? "Submitted" : <Pill tone="warn">None</Pill>}
              </Field>
              <Field label="Payouts">
                {user.stripePayoutsReady ? (
                  <Pill tone="good">Ready</Pill>
                ) : user.stripeConnected ? (
                  <Pill tone="warn">Connected, not ready</Pill>
                ) : (
                  <Pill tone="flat">Not connected</Pill>
                )}
              </Field>
              {user.socials.map((s) => (
                <Field key={s.label} label={s.label}>
                  {s.value}
                </Field>
              ))}
            </div>
            {user.artistBio && <p className="mt-3 text-sm text-muted">{user.artistBio}</p>}
          </section>
        )}
      </div>

      <section>
        <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
          Ticket history
        </h2>
        {user.recentTickets.length === 0 ? (
          <p className="mt-3 text-sm text-muted">No tickets yet.</p>
        ) : (
          <table className="mt-3 w-full text-left text-sm">
            <thead>
              <tr className="border-b border-muted/15 text-muted">
                <th className="pb-2 font-heading">Event</th>
                <th className="pb-2 font-heading">Show date</th>
                <th className="pb-2 font-heading">Qty</th>
                <th className="pb-2 font-heading">Paid</th>
                <th className="pb-2 font-heading">Bought</th>
                <th className="pb-2 font-heading">Status</th>
              </tr>
            </thead>
            <tbody>
              {user.recentTickets.map((t) => (
                <tr key={t.id} className="border-b border-muted/10 last:border-0">
                  <td className="py-2 text-foreground">{t.eventTitle}</td>
                  <td className="py-2 text-muted">{t.eventDate ? dmy(t.eventDate) : "—"}</td>
                  <td className="py-2 text-muted">{t.quantity}</td>
                  <td className="py-2 text-muted">{formatEuros(t.pricePaidCents)}</td>
                  <td className="py-2 text-muted">{dmy(t.purchasedAt)}</td>
                  <td className="py-2">
                    {t.refunded ? (
                      <Pill tone="warn">Refunded</Pill>
                    ) : t.checkedIn ? (
                      <Pill tone="good">Attended</Pill>
                    ) : (
                      <Pill tone="flat">Valid</Pill>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
