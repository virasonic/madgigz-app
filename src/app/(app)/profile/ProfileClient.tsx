"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import SocialLinks from "@/components/ui/SocialLinks";
import { buildSocialLinks } from "@/lib/socials";
import Button from "@/components/ui/Button";
import ManageShowModal from "@/components/artist/ManageShowModal";
import PayoutCard from "@/components/artist/PayoutCard";
import FiscalIdentityCard from "@/components/artist/FiscalIdentityCard";
import IntroReel from "@/components/artist/IntroReel";
import IntroReelModal from "@/components/artist/IntroReelModal";
import { removeIntroReel } from "./intro-actions";
import { createClient } from "@/lib/supabase/client";
import { clearOfflineTickets } from "@/lib/offline-tickets";
import { clearNativeOfflineTickets } from "@/lib/offline-tickets-native";
import { AppUser, ContentPost, EventItem } from "@/lib/types";
import { isArtistRole } from "@/lib/roles";
import DeleteAccountDialog from "@/components/account/DeleteAccountDialog";
import FeedbackDialog from "@/components/account/FeedbackDialog";
import { LegalLinksRow } from "@/components/legal/LegalNotice";
import SwitchToArtistRow from "./SwitchToArtistRow";
import { useT } from "@/lib/i18n/LocaleProvider";
import { LOCALES, LOCALE_LABELS } from "@/lib/i18n/config";
import { useUrlModal } from "@/lib/useUrlModal";
import { dateLocale } from "@/lib/dates";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";

// Read once at module load (React purity), same pattern as the feed/tickets
// "now" reads. Splits the artist's upcoming shows from past ones (#141).
const TODAY = new Date().toISOString().slice(0, 10);

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
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
  const { t } = useT();
  const searchParams = useSearchParams();
  if (searchParams.get("restored") !== "1") return null;
  return (
    <div className="mb-6 rounded-xl bg-surface px-4 py-3">
      <p className="font-heading text-sm text-foreground">{t("profile.restoredTitle")}</p>
      <p className="mt-1 text-xs text-muted">{t("profile.restoredBody")}</p>
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
  onSendFeedback,
  onLogOut,
  onDeleteAccount,
  payoutConnected,
  payoutReady,
  fiscalProvided,
  isArtist,
  isAdmin,
}: {
  onClose: () => void;
  onSendFeedback: () => void;
  onLogOut: () => void;
  onDeleteAccount: () => void;
  payoutConnected: boolean;
  payoutReady: boolean;
  fiscalProvided: boolean;
  isArtist: boolean;
  isAdmin: boolean;
}) {
  const { t, locale, setLocale } = useT();
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);
  const comingSoonRows = ["profile.promotions", "profile.analytics"];
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[88dvh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>
        {/* Explicit close control: the sheet also dismisses on drag / tap-out,
            but in the native app there's no browser back button, so without a
            visible X the settings screen felt like a dead end (esp. iOS). */}
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-xl text-foreground">{t("settings.title")}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background text-muted transition-colors hover:bg-primary hover:text-foreground"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="mt-4 flex flex-col gap-2">
          <Link
            href="/profile/edit"
            className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
          >
            <span className="text-sm text-foreground">{t("settings.editProfile")}</span>
            <span className="text-xs text-muted">
              {isArtist ? t("settings.editProfileBioPhoto") : t("settings.editProfilePhoto")}
            </span>
          </Link>

          {/* Mobile entry to the web admin panel (#157) - the desktop SideNav
              already links here, but the phone had no way in. Label stays
              English on purpose: the admin panel is English-only by design. */}
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
            >
              <span className="text-sm text-foreground">Admin panel</span>
              <span className="text-xs text-muted">Manage gigs, scan at the door</span>
            </Link>
          )}

          {/* Detected from the browser on the first visit; this is the manual
              override, remembered after. */}
          <div className="flex items-center justify-between rounded-2xl bg-background px-4 py-3">
            <span className="text-sm text-foreground">{t("language.label")}</span>
            <div className="flex gap-1 rounded-full bg-surface p-1">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code)}
                  className={`rounded-full px-3 py-1 text-xs font-heading ${
                    locale === code ? "bg-primary text-foreground" : "text-muted"
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>
          </div>

          {isArtist && <PayoutCard connected={payoutConnected} ready={payoutReady} />}
          {isArtist && <FiscalIdentityCard provided={fiscalProvided} />}
          {isArtist &&
            comingSoonRows.map((row) => (
              <div
                key={row}
                className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5"
              >
                <span className="text-sm text-foreground">{t(row)}</span>
                <span className="text-xs uppercase text-muted">{t("settings.comingSoon")}</span>
              </div>
            ))}

          {/* Fans can opt into becoming an artist here; it drops them on the
              same claim form and admin review a new artist goes through. */}
          {!isArtist && <SwitchToArtistRow />}

          {/* Below the real settings, above nothing - it is a thing you reach
              for when something has gone wrong, so it should be findable
              without competing with what people came here to do. */}
          <button
            type="button"
            onClick={onSendFeedback}
            className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5 text-left"
          >
            <span className="text-sm text-foreground">{t("settings.sendFeedback")}</span>
            <span className="text-xs text-muted">{t("settings.sendFeedbackHint")}</span>
          </button>

          {/* Account controls live here now (#113) rather than loose on the
              profile body. Log Out as a normal row. */}
          <button
            type="button"
            onClick={onLogOut}
            className="flex items-center justify-between rounded-2xl bg-background px-4 py-3.5 text-left"
          >
            <span className="text-sm text-foreground">{t("profile.logOut")}</span>
          </button>
        </div>

        {/* The permanent home of the legal documents - consumer law expects
            them findable any time, not only flashed at signup/checkout. */}
        <LegalLinksRow className="mt-6 flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-xs text-muted" />

        {/* Quiet and last: rare and irreversible, kept apart from the rows above
            so it doesn't sit like just another setting. */}
        <button
          type="button"
          onClick={onDeleteAccount}
          className="mt-4 w-full text-center text-xs text-muted underline underline-offset-4"
        >
          {t("profile.deleteAccount")}
        </button>
      </div>
    </div>
  );
}

function ShowRow({ show, onOpen }: { show: EventItem; onOpen: () => void }) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  return (
    <button
      onClick={onOpen}
      className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left"
    >
      {/* Poster thumbnail (#114): an artist recognises a show by its art far
          faster than by reading titles down a list. */}
      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-background">
        <Image src={show.image} alt="" fill sizes="56px" className="object-cover" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate font-heading text-sm text-foreground">{show.title}</p>
          {!show.active && (
            <span className="shrink-0 rounded-full bg-muted/15 px-2 py-0.5 text-[10px] font-heading uppercase tracking-wide text-muted">
              {t("profile.hidden")}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-muted">
          {formatDate(show.date, dl)} · {show.venue}
        </p>
      </div>
      <span className="shrink-0 text-xs text-muted">{t("profile.soldCount", { count: show.sold })}</span>
    </button>
  );
}

interface ProfileClientProps {
  user: AppUser;
  savedCount: number;
  attendedCount: number;
  shows: EventItem[];
  taggedShows: EventItem[];
  attendedEvents: EventItem[];
  unreadCount: number;
  /** The artist's pinned intro reel (#143), or null. Null for fans. */
  initialIntro: ContentPost | null;
  /** Whether the organiser has fiscal details on file (#97). False for fans. */
  fiscalProvided: boolean;
}

export default function ProfileClient({
  user,
  savedCount,
  attendedCount,
  shows,
  taggedShows,
  attendedEvents,
  unreadCount,
  initialIntro,
  fiscalProvided,
}: ProfileClientProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const router = useRouter();
  const [activeShow, setActiveShow] = useState<EventItem | null>(null);
  // Kept separate from activeShow so the modal knows which one it is looking at:
  // the artist's own show is managed, a show they are only tagged on is not.
  const [activeTaggedShow, setActiveTaggedShow] = useState<EventItem | null>(null);
  // #102: the settings sheet lives in ?settings=1 so the back button closes it
  // instead of leaving the profile. The Stripe payout round-trip (below) and the
  // gear button both open it through this.
  const settingsModal = useUrlModal("settings");
  const settingsOpen = settingsModal.isOpen;
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [hiddenOpen, setHiddenOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  // Artist intro reel (#143): local so add/replace/remove reflect immediately.
  const [intro, setIntro] = useState<ContentPost | null>(initialIntro);
  const [introModalOpen, setIntroModalOpen] = useState(false);
  const [introRemoving, setIntroRemoving] = useState(false);

  async function handleRemoveIntro() {
    setIntroRemoving(true);
    const result = await removeIntroReel();
    setIntroRemoving(false);
    if (!result.error) setIntro(null);
  }

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
  // Active shows split into upcoming vs past (#141) so an artist's own list stops
  // showing gigs that already happened under the same heading as what's coming up.
  const upcomingShows = useMemo(
    () => shows.filter((show) => show.active && show.date >= TODAY),
    [shows]
  );
  const pastShows = useMemo(
    () => shows.filter((show) => show.active && show.date < TODAY),
    [shows]
  );
  const hiddenShows = useMemo(() => shows.filter((show) => !show.active), [shows]);

  async function handleLogOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Don't leave this account's offline tickets on the device for the next
    // person to sign in (#129) — both the web cache and the native mirror.
    clearOfflineTickets();
    void clearNativeOfflineTickets();
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl">
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
          aria-label={t("profile.notificationsAria")}
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
          onClick={() => settingsModal.open("1")}
          aria-label={t("profile.settingsAria")}
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
        <>
          <div className="mb-8 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-3xl text-foreground">{attendedCount}</p>
              <p className="text-sm text-muted">{t("profile.attended")}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-3xl text-foreground">{savedCount}</p>
              <p className="text-sm text-muted">{t("profile.saved")}</p>
            </div>
          </div>

          {/* Past-events poster wall (#116): the DICE "memories" pattern - the
              posters of shows the fan was scanned in to, newest first. It's the
              first real content on an otherwise-sparse fan profile (#115); it
              only appears once there's something to show, so a brand-new fan
              doesn't see an empty shelf. Each poster links to the public event
              page. */}
          {attendedEvents.length > 0 && (
            <div className="mb-8">
              <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
                {t("profile.pastShowsTitle")}
              </h2>
              <p className="mt-1 text-xs text-muted">{t("profile.pastShowsSubtitle")}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {attendedEvents.map((event) => (
                  <Link
                    key={event.id}
                    href={`/e/${event.id}`}
                    className="group relative aspect-[3/4] overflow-hidden rounded-xl bg-surface"
                  >
                    {event.image ? (
                      <Image
                        src={event.image}
                        alt={event.title}
                        fill
                        sizes="(min-width: 640px) 160px, 33vw"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center p-2 text-center">
                        <span className="line-clamp-3 font-heading text-xs text-muted">
                          {event.title}
                        </span>
                      </div>
                    )}
                    {/* A quiet gradient so the title stays legible on any poster;
                        the whole tile is the tap target. */}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5 pt-6">
                      <p className="truncate font-heading text-[11px] leading-tight text-white">
                        {event.title}
                      </p>
                      <p className="truncate text-[10px] text-white/70">
                        {formatDate(event.date, dl)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </>
      ) : user.artistStatus !== "approved" ? (
        <div className="mb-8 rounded-2xl bg-surface p-5 text-center">
          {user.artistStatus === "rejected" ? (
            <>
              <p className="font-heading text-foreground">{t("profile.rejectedTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("profile.rejectedBody")}</p>
            </>
          ) : claimSubmitted ? (
            <>
              <p className="font-heading text-foreground">{t("profile.underReviewTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("profile.underReviewBody")}</p>
            </>
          ) : (
            // The claim form used to be reachable only via the confirmation
            // email's redirect, and mail scanners consume that link before the
            // artist taps it - so they'd sign in, never see the form, and sit
            // here being told we were reviewing evidence they never sent.
            <>
              <p className="font-heading text-foreground">{t("profile.finishTitle")}</p>
              <p className="mt-1 text-sm text-muted">{t("profile.finishBody")}</p>
              <Link href="/signup/artist-profile" className="mt-4 block">
                <Button>{t("common.continue")}</Button>
              </Link>
            </>
          )}
        </div>
      ) : (
        <>
          <Suspense>
            <PayoutReturnDetector onReturn={() => settingsModal.open("1")} />
          </Suspense>

          <div className="mb-6 flex gap-3">
            <Link href="/profile/add-show" className="flex-1">
              <Button>{t("profile.addShow")}</Button>
            </Link>
            <Link href="/profile/scan" className="flex-1">
              <Button variant="secondary">{t("profile.scanTickets")}</Button>
            </Link>
          </div>

          {/* Intro reel (#143): a "this is me" clip the artist can set even with
              no show to promote, so their profile is never empty. */}
          <div className="mb-6">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-heading text-sm uppercase tracking-wide text-muted">
                {t("introReel.sectionTitle")}
              </h2>
              {intro && (
                <button
                  type="button"
                  onClick={handleRemoveIntro}
                  disabled={introRemoving}
                  className="text-xs font-heading text-danger disabled:opacity-50"
                >
                  {introRemoving ? t("introReel.removing") : t("introReel.remove")}
                </button>
              )}
            </div>
            {intro ? (
              <>
                <div className="w-32">
                  <IntroReel post={intro} />
                </div>
                <button
                  type="button"
                  onClick={() => setIntroModalOpen(true)}
                  className="mt-3 w-full rounded-full border border-muted/30 py-2.5 text-sm font-heading text-foreground"
                >
                  {t("introReel.replace")}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setIntroModalOpen(true)}
                className="flex w-full flex-col items-center gap-1 rounded-2xl border border-dashed border-muted/30 px-4 py-6 text-center"
              >
                <span className="font-heading text-sm text-foreground">{t("introReel.addTitle")}</span>
                <span className="text-xs text-muted">{t("introReel.addHint")}</span>
              </button>
            )}
          </div>

          {/* Followers is back: #60 gave it something real to count. A zero
              here now means nobody has followed yet, which is true, rather
              than meaning the feature doesn't exist. */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{user.followerCount}</p>
              <p className="text-xs text-muted">{t("profile.followers")}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{shows.length}</p>
              <p className="text-xs text-muted">{t("profile.shows")}</p>
            </div>
            <div className="rounded-2xl bg-surface p-4 text-center">
              <p className="font-display text-2xl text-foreground">{ticketsSold}</p>
              <p className="text-xs text-muted">{t("profile.ticketsSold")}</p>
            </div>
          </div>

          <h2 className="mb-3 font-heading text-sm uppercase tracking-wide text-muted">
            {t("profile.upcomingShows")}
          </h2>
          {shows.length === 0 ? (
            <p className="mb-8 text-sm text-muted">{t("profile.noShows")}</p>
          ) : (
            <div className="mb-8 flex flex-col gap-3">
              {upcomingShows.length === 0 && pastShows.length === 0 ? (
                <p className="text-sm text-muted">{t("profile.allHidden")}</p>
              ) : upcomingShows.length === 0 ? (
                <p className="text-sm text-muted">{t("profile.noUpcomingShows")}</p>
              ) : (
                upcomingShows.map((show) => (
                  <ShowRow key={show.id} show={show} onOpen={() => setActiveShow(show)} />
                ))
              )}

              {/* Past shows separated (#141): still the artist's to manage (sales,
                  content), but not mixed in with what's coming up. */}
              {pastShows.length > 0 && (
                <>
                  <h3 className="mb-1 mt-4 font-heading text-sm uppercase tracking-wide text-muted">
                    {t("profile.pastShows")}
                  </h3>
                  {pastShows.map((show) => (
                    <ShowRow key={show.id} show={show} onOpen={() => setActiveShow(show)} />
                  ))}
                </>
              )}

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
                    {t("profile.hiddenShows")} ({hiddenShows.length})
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
                {t("profile.taggedIn")}
              </h2>
              <div className="mb-8 flex flex-col gap-3">
                {taggedShows.map((show) => (
                  <button
                    key={show.id}
                    onClick={() => setActiveTaggedShow(show)}
                    className="flex items-center gap-3 rounded-2xl bg-surface p-3 text-left"
                  >
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-background">
                      <Image src={show.image} alt="" fill sizes="56px" className="object-cover" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-heading text-sm text-foreground">{show.title}</p>
                      <p className="truncate text-xs text-muted">
                        {new Date(show.date).toLocaleDateString(dl, {
                          day: "numeric",
                          month: "short",
                          timeZone: "UTC",
                        })}{" "}
                        · {show.venue} · {t("profile.byArtist", { artist: show.artist })}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}

      {/* Log Out and Delete account moved into Settings (#113). */}
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
          onClose={settingsModal.close}
          // Closes Settings on the way, so the feedback sheet isn't stacked on
          // top of another one and closing it doesn't reveal a sheet nobody
          // asked to still be there.
          onSendFeedback={() => {
            settingsModal.close();
            setFeedbackOpen(true);
          }}
          onLogOut={handleLogOut}
          // Close Settings first so the delete dialog isn't stacked on the sheet.
          onDeleteAccount={() => {
            settingsModal.close();
            setDeleteOpen(true);
          }}
          payoutConnected={user.stripeAccountConnected}
          payoutReady={user.stripePayoutsReady}
          fiscalProvided={fiscalProvided}
          isArtist={artistTools}
          isAdmin={user.role === "admin"}
        />
      )}
      {feedbackOpen && <FeedbackDialog onClose={() => setFeedbackOpen(false)} />}
      {introModalOpen && (
        <IntroReelModal
          onClose={() => setIntroModalOpen(false)}
          onSaved={(post) => setIntro(post)}
        />
      )}
    </div>
  );
}
