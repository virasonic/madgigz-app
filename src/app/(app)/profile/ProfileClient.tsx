"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import SocialLinks from "@/components/ui/SocialLinks";
import { buildSocialLinks } from "@/lib/socials";
import Button from "@/components/ui/Button";
import ManageShowModal from "@/components/artist/ManageShowModal";
import PayoutCard from "@/components/artist/PayoutCard";
import { createClient } from "@/lib/supabase/client";
import { AppUser, EventItem } from "@/lib/types";
import { isArtistRole } from "@/lib/roles";
import DeleteAccountDialog from "@/components/account/DeleteAccountDialog";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

// Stripe's onboarding return_url points back at /profile?payout=return (and
// ?payout=refresh if the artist bails partway) - now that PayoutCard lives
// inside a sheet the artist has to open themselves, that redirect needs to
// pop the sheet open too, or the whole round trip looks like it did nothing.
// Isolated in its own component because useSearchParams needs a Suspense
// boundary, and gating that boundary to just this artist-only sheet is
// cheaper than wrapping the whole page.
function RestoredNotice() {
  const searchParams = useSearchParams();
  if (searchParams.get("restored") !== "1") return null;
  return (
    <div className="mb-6 rounded-xl bg-surface px-4 py-3">
      <p className="font-heading text-sm text-foreground">Welcome back - your account is safe</p>
      <p className="mt-1 text-xs text-muted">
        Signing in cancelled the deletion you&apos;d scheduled. Nothing was removed.
      </p>
    </div>
  );
}

function PayoutReturnDetector({ onReturn }: { onReturn: () => void }) {
  const searchParams = useSearchParams();
  const payoutParam = searchParams.get("payout");

  useEffect(() => {
    if (payoutParam === "return" || payoutParam === "refresh") onReturn();
    // onReturn is a fresh closure every render (setSettingsOpen(true)) - only
    // payoutParam actually identifies when this should fire.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payoutParam]);

  return null;
}

function SettingsSheet({
  onClose,
  payoutConnected,
  payoutReady,
  isArtist,
}: {
  onClose: () => void;
  payoutConnected: boolean;
  payoutReady: boolean;
  isArtist: boolean;
}) {
  const comingSoonRows = ["Promotions", "Analytics"];
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-3xl bg-surface p-6 pb-10"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-muted/30" />
        <h2 className="font-display text-xl text-foreground">Settings</h2>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/profile/edit"
            className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
          >
            <span className="text-sm text-foreground">Edit Profile</span>
            <span className="text-xs text-muted">{isArtist ? "Bio & photo" : "Photo"}</span>
          </Link>
          {isArtist && <PayoutCard connected={payoutConnected} ready={payoutReady} />}
          {isArtist &&
            comingSoonRows.map((row) => (
              <div
                key={row}
                className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
              >
                <span className="text-sm text-foreground">{row}</span>
                <span className="text-xs uppercase text-muted">Soon</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

function ShowRow({ show, onOpen }: { show: EventItem; onOpen: () => void }) {
  return (
    <button
      onClick={onOpen}
      className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-3.5 text-left"
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate font-heading text-sm text-foreground">{show.title}</p>
          {!show.active && (
            <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide text-muted">
              Hidden
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted">
          {formatDate(show.date)} · {show.venue}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted">{show.sold} sold</span>
    </button>
  );
}

interface ProfileClientProps {
  user: AppUser;
  savedCount: number;
  attendedCount: number;
  shows: EventItem[];
  taggedShows: EventItem[];
  unreadCount: number;
}

export default function ProfileClient({
  user,
  savedCount,
  attendedCount,
  shows,
  taggedShows,
  unreadCount,
}: ProfileClientProps) {
  const router = useRouter();
  const [activeShow, setActiveShow] = useState<EventItem | null>(null);
  // Kept separate from activeShow so the modal knows which one it is looking at:
  // the artist's own show is managed, a show they are only tagged on is not.
  const [activeTaggedShow, setActiveTaggedShow] = useState<EventItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Admins keep their own badge - they get the artist tools below, but
  // labelling the account "Artist" would misreport what it actually is.
  const roleLabel = user.role === "admin" ? "Admin" : user.role === "artist" ? "Artist" : "Fan";
  const artistTools = isArtistRole(user.role);
  const displayName = user.artistName ?? user.username;
  const hasSocials = buildSocialLinks(user).length > 0;
  // Evidence is the one thing only the claim form can set, so it's the reliable
  // signal that the form was actually completed.
  const claimSubmitted = user.evidenceSubmitted;
  const ticketsSold = useMemo(() => shows.reduce((sum, show) => sum + show.sold, 0), [shows]);
  const visibleShows = useMemo(() => shows.filter((show) => show.active), [shows]);
  const hiddenShows = useMemo(() => shows.filter((show) => !show.active), [shows]);

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="p-4">
      <Suspense>
        <RestoredNotice />
      </Suspense>

      <div className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Avatar photoUrl={user.artistPhotoUrl} name={displayName} size={64} />
          <div>
            <h1 className="font-display text-2xl text-foreground">{displayName}</h1>
            <span className="rounded-full bg-surface px-2.5 py-0.5 text-xs font-heading uppercase tracking-wide text-muted">
              {roleLabel}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
        <Link
          href="/notifications"
          aria-label="Notifications"
          className="relative flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M18 8a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6Z"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path d="M13.7 20a2 2 0 0 1-3.4 0" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-primary ring-2 ring-surface" />
          )}
        </Link>

        {/* Everyone gets Settings now - it holds Edit Profile, and a fan can
            change their picture. Payouts stay artist-only inside the sheet. */}
        <button
          type="button"
          onClick={() => setSettingsOpen(true)}
          aria-label="Settings"
          className="flex h-10 w-10 items-center justify-center rounded-full bg-surface text-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
            <path
              d="M19.4 13a7.6 7.6 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7.7 7.7 0 0 0-1.7-1L15 3h-4l-.3 2.5a7.7 7.7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.6 7.6 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7.7 7.7 0 0 0 1.7 1L11 21h4l.3-2.5a7.7 7.7 0 0 0 1.7-1l2.4 1 2-3.4-2-1.6Z"
              stroke="currentColor"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        </div>
      </div>

      {/* Without this an artist writes a bio in Edit Profile and never sees it
          again - it only showed on the public page, which they get redirected
          away from. */}
      {/* One wrapper so bio-only, links-only, and both all get the same spacing
          against the header above and whatever follows. */}
      {artistTools && (user.artistBio || hasSocials) && (
        <div className="-mt-2 mb-6 flex flex-col gap-3">
          {user.artistBio && (
            <p className="text-sm leading-relaxed text-foreground/90">{user.artistBio}</p>
          )}
          <SocialLinks source={user} />
        </div>
      )}

      {user.role === "fan" ? (
        <div className="mb-8 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="font-display text-3xl text-foreground">{attendedCount}</p>
            <p className="text-sm text-muted">Attended</p>
          </div>
          <div className="rounded-2xl bg-surface p-4 text-center">
            <p className="font-display text-3xl text-foreground">{savedCount}</p>
            <p className="text-sm text-muted">Saved</p>
          </div>
        </div>
      ) : user.artistStatus !== "approved" ? (
        <div className="mb-8 rounded-2xl bg-surface p-5 text-center">
          {user.artistStatus === "rejected" ? (
            <>
              <p className="font-heading text-foreground">Application not approved</p>
              <p className="mt-1 text-sm text-muted">
                Your artist profile wasn&apos;t approved. Contact us if you&apos;d like to
                submit more evidence.
              </p>
            </>
          ) : claimSubmitted ? (
            <>
              <p className="font-heading text-foreground">Under review</p>
              <p className="mt-1 text-sm text-muted">
                We&apos;re verifying your artist profile against your submitted evidence. Once
                approved, you&apos;ll be able to add shows and post content.
              </p>
            </>
          ) : (
            // The claim form used to be reachable only via the confirmation
            // email's redirect, and mail scanners consume that link before the
            // artist taps it - so they'd sign in, never see the form, and sit
            // here being told we were reviewing evidence they never sent.
            <>
              <p className="font-heading text-foreground">Finish your artist profile</p>
              <p className="mt-1 text-sm text-muted">
                We still need your artist name, a social link and something that shows the
                profile is yours, before we can approve you.
              </p>
              <Link href="/signup/artist-profile" className="mt-4 block">
                <Button>Continue</Button>
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <Suspense>
            <PayoutReturnDetector onReturn={() => setSettingsOpen(true)} />
          </Suspense>

          <div className="mb-6 flex gap-3">
            <Link href="/profile/add-show" className="flex-1">
              <Button>Add Show</Button>
            </Link>
            <Link href="/profile/scan" className="flex-1">
              <Button variant="secondary">Scan Tickets</Button>
            </Link>
          </div>

          {/* Followers is back: #60 gave it something real to count. A zero
              here now means nobody has followed yet, which is true, rather
              than meaning the feature doesn't exist. */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{user.followerCount}</p>
              <p className="text-xs text-muted">Followers</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{shows.length}</p>
              <p className="text-xs text-muted">Shows</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{ticketsSold}</p>
              <p className="text-xs text-muted">Tickets Sold</p>
            </div>
          </div>

          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            Your Shows
          </h2>
          {shows.length === 0 ? (
            <p className="mb-8 text-sm text-muted">
              You haven&apos;t added any shows yet.
            </p>
          ) : (
            <div className="mb-8 flex flex-col gap-3">
              {visibleShows.length === 0 && (
                <p className="text-sm text-muted">
                  All your shows are hidden right now.
                </p>
              )}
              {visibleShows.map((show) => (
                <ShowRow key={show.id} show={show} onOpen={() => setActiveShow(show)} />
              ))}

              {/* Hidden shows are the ones an artist has deliberately parked -
                  still theirs to manage, but not what they came to the page
                  for, so they stay folded away until asked for. */}
              {hiddenShows.length > 0 && (
                <>
                  <button
                    onClick={() => setHiddenOpen((open) => !open)}
                    aria-expanded={hiddenOpen}
                    className="flex items-center gap-2 self-start py-1 text-sm font-heading text-muted"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      aria-hidden="true"
                      className={`transition-transform duration-150 ${hiddenOpen ? "rotate-90" : ""}`}
                    >
                      <path
                        d="M9 6l6 6-6 6"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                    Hidden shows ({hiddenShows.length})
                  </button>
                  {hiddenOpen &&
                    hiddenShows.map((show) => (
                      <ShowRow key={show.id} show={show} onOpen={() => setActiveShow(show)} />
                    ))}
                </>
              )}
            </div>
          )}

          {/* Kept apart from Your Shows on purpose: these belong to someone
              else, so tapping opens the show read-only - details and content,
              no editing, no takings. It used to link to /profile/{artistId},
              which 404s for a show with no owning artist (anything created from
              the admin panel) and was the wrong destination even when it
              didn't - you want the show, not the promoter's profile. */}
          {taggedShows.length > 0 && (
            <>
              <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
                Tagged in
              </h2>
              <div className="mb-8 flex flex-col gap-3">
                {taggedShows.map((show) => (
                  <button
                    key={show.id}
                    onClick={() => setActiveTaggedShow(show)}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-surface p-4 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading text-sm text-foreground">{show.title}</p>
                      <p className="truncate text-xs text-muted">
                        {new Date(show.date).toLocaleDateString("en-GB", {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}{" "}
                        · {show.venue} · by {show.artist}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <Button variant="ghost" onClick={handleLogOut}>
        Log Out
      </Button>

      {/* Quiet, and below Log Out, because it is a rare and irreversible thing -
          but present rather than hidden behind an email to support. */}
      <button
        type="button"
        onClick={() => setDeleteOpen(true)}
        className="mt-4 w-full text-center text-xs text-muted underline underline-offset-4"
      >
        Delete my account
      </button>

      {deleteOpen && <DeleteAccountDialog onClose={() => setDeleteOpen(false)} />}

      {activeTaggedShow && (
        <ManageShowModal
          show={activeTaggedShow}
          artistName={displayName}
          canManage={false}
          onClose={() => setActiveTaggedShow(null)}
          onChanged={() => router.refresh()}
        />
      )}

      {activeShow && (
        <ManageShowModal
          show={activeShow}
          artistName={displayName}
          onClose={() => setActiveShow(null)}
          onChanged={() => router.refresh()}
        />
      )}
      {settingsOpen && (
        <SettingsSheet
          onClose={() => setSettingsOpen(false)}
          payoutConnected={user.stripeAccountConnected}
          payoutReady={user.stripePayoutsReady}
          isArtist={artistTools}
        />
      )}
    </div>
  );
}
