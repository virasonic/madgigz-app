"use client";

import Link from "next/link";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import Avatar from "@/components/ui/Avatar";
import BackButton from "@/components/ui/BackButton";
import FriendButton from "@/components/friends/FriendButton";
import { useT } from "@/lib/i18n/LocaleProvider";
import { absoluteUrl } from "@/lib/site";
import { shareUrl } from "@/lib/share";
import { FanCard, FriendLink, FriendSuggestion, friendStatusWith } from "@/lib/friends";
import { searchFans } from "../actions";

export default function FindFriendsClient({
  username,
  links,
  suggestions,
}: {
  username: string;
  links: FriendLink[];
  suggestions: FriendSuggestion[];
}) {
  const { t } = useT();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<FanCard[] | null>(null);
  const [searching, setSearching] = useState(false);

  // Debounced server-side search; results arrive in a callback, never set
  // synchronously in the effect body. Below three characters nothing is asked
  // and whatever was last found is simply not shown.
  const showResults = query.trim().length >= 3 ? results : null;
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) return;
    let stale = false;
    const id = setTimeout(async () => {
      setSearching(true);
      const found = await searchFans(q);
      if (stale) return;
      setResults(found);
      setSearching(false);
    }, 250);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [query]);

  // The QR carries the profile link, so any phone camera opens it (and the
  // installed app claims /profile/* through Universal Links).
  const profileUrl = absoluteUrl(`/profile/${username}`);
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(profileUrl, {
      margin: 1,
      width: 320,
      color: { dark: "#0a0807", light: "#f3f1d1" },
    }).then((url) => {
      if (!cancelled) setQr(url);
    });
    return () => {
      cancelled = true;
    };
  }, [profileUrl]);

  const [shared, setShared] = useState<"copied" | "failed" | null>(null);
  async function share() {
    const outcome = await shareUrl(profileUrl, t("friends.inviteTitle", { username }));
    if (outcome === "copied" || outcome === "failed") setShared(outcome);
  }

  function row(card: FanCard, subline?: string) {
    return (
      <div key={card.id} className="flex items-center gap-3 py-2.5">
        <Link href={`/profile/${card.username}`} className="flex min-w-0 flex-1 items-center gap-3">
          <Avatar photoUrl={card.photoUrl} name={card.username} size={40} />
          <span className="min-w-0">
            <span className="block truncate font-heading text-sm text-foreground">{card.username}</span>
            {subline && <span className="block text-xs text-muted">{subline}</span>}
          </span>
        </Link>
        <FriendButton otherId={card.id} status={friendStatusWith(links, card.id)} size="sm" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:mx-auto lg:max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <BackButton href="/friends" />
        <h1 className="font-display text-2xl text-foreground">{t("friends.find")}</h1>
      </div>

      <label className="sr-only" htmlFor="friend-search">
        {t("friends.searchPlaceholder")}
      </label>
      <div className="flex items-center gap-2 rounded-2xl border border-muted/20 bg-surface px-3.5">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-muted">
          <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.8" />
          <path d="m16 16 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <input
          id="friend-search"
          type="search"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("friends.searchPlaceholder")}
          className="min-w-0 flex-1 bg-transparent py-3 text-foreground placeholder:text-muted/60 focus:outline-none"
        />
      </div>
      {showResults === null ? (
        query.trim().length > 0 && <p className="mt-2 text-xs text-muted">{t("friends.searchHint")}</p>
      ) : showResults.length === 0 ? (
        <p className="mt-3 text-sm text-muted">{searching ? "…" : t("friends.noResults")}</p>
      ) : (
        <div className="mt-2 flex flex-col divide-y divide-muted/10">{showResults.map((c) => row(c))}</div>
      )}

      <section className="mt-6 flex flex-col items-center gap-3 rounded-3xl bg-surface p-5 text-center">
        <div className="h-36 w-36 overflow-hidden rounded-2xl bg-foreground p-1.5">
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- generated data URL
            <img src={qr} alt={t("friends.qrAlt", { username })} className="h-full w-full" />
          ) : (
            <div className="h-full w-full rounded-xl bg-muted/20" />
          )}
        </div>
        <div>
          <p className="font-display text-lg text-foreground">@{username}</p>
          <p className="mt-1 text-xs text-muted">{t("friends.qrBody")}</p>
        </div>
        <button
          type="button"
          onClick={share}
          className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-heading text-foreground"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3v12M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {t("friends.shareInvite")}
        </button>
        {shared === "copied" && <p className="text-xs text-accent">{t("share.linkCopied")}</p>}
        {shared === "failed" && (
          <input readOnly value={profileUrl} onFocus={(e) => e.currentTarget.select()} className="w-full rounded-xl bg-background px-3 py-2 text-xs text-muted" />
        )}
      </section>

      {suggestions.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-1 font-heading text-sm text-muted">{t("friends.suggested")}</h2>
          <div className="flex flex-col divide-y divide-muted/10">
            {suggestions.map((s) =>
              row(
                s.profile,
                s.mutualCount === 1 ? t("friends.mutualOne") : t("friends.mutualMany", { count: s.mutualCount })
              )
            )}
          </div>
        </section>
      )}
    </div>
  );
}
