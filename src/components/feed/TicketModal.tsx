"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import Button from "@/components/ui/Button";
import { LegalNotice } from "@/components/legal/LegalNotice";
import { createCheckout, previewPromoCode } from "@/app/(app)/checkout-actions";
import { createClient } from "@/lib/supabase/client";
import { EventItem, EventTier, EventTierRow, mapEventTier, tierIsAvailable } from "@/lib/types";
import { eventPath } from "@/lib/site";
import ShareEventButton from "./ShareEventButton";
import LikeButton from "./LikeButton";
import { useT } from "@/lib/i18n/LocaleProvider";
import { dateLocale } from "@/lib/dates";
import { useStripeTestMode } from "@/lib/stripe-mode";
import { useLiveEventStats } from "@/lib/realtime";
import { useDragToDismiss } from "@/components/ui/useDragToDismiss";
import { openExternal } from "@/lib/native";

type Tab = "tickets" | "info";

interface TicketModalProps {
  event: EventItem;
  initialTab?: Tab;
  onClose: () => void;
  onPurchased?: () => void;
  // Optional because the public /e/[id] page opens this sheet for people who
  // aren't signed in, and there's nowhere to record a like for them.
  liked?: boolean;
  onToggleLike?: () => void;
  // A guest browsing the feed can open this sheet to read a show, but buying a
  // MadGigz-ticketed show needs an account - the buy button becomes a sign-in
  // link. Externally-ticketed shows are unaffected (they need no account).
  isGuest?: boolean;
}

function formatDate(iso: string, dl: string) {
  return new Date(iso).toLocaleDateString(dl, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export default function TicketModal({
  event,
  initialTab = "tickets",
  onClose,
  onPurchased,
  liked = false,
  onToggleLike,
  isGuest = false,
}: TicketModalProps) {
  const { t, locale } = useT();
  const dl = dateLocale(locale);
  const { handleProps, sheetStyle } = useDragToDismiss(onClose);
  // A test-mode Stripe key can't charge a real card, so this is a heads-up, not
  // a guard. Sourced server-side from STRIPE_SECRET_KEY, so it turns itself off
  // the moment live keys are set.
  const isTestMode = useStripeTestMode();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [quantity, setQuantity] = useState(1);
  const [purchased, setPurchased] = useState(false);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | undefined>();

  const [promoCode, setPromoCode] = useState("");
  const [promoLabel, setPromoLabel] = useState<string | null>(null);
  const [discountedTotal, setDiscountedTotal] = useState<number | null>(null);
  const [promoError, setPromoError] = useState<string | undefined>();
  const [checkingPromo, setCheckingPromo] = useState(false);

  // Price tiers (#151). Loaded on open — event_tiers is world-readable, so the
  // browser client reads them directly. Empty = a single-price show, and the
  // whole picker below simply doesn't render. Default the selection to the first
  // still-available tier.
  const [tiers, setTiers] = useState<EventTier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase
      .from("event_tiers")
      .select("*")
      .eq("event_id", event.id)
      .order("sort_order", { ascending: true })
      .order("price", { ascending: true })
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        const rows = (data as EventTierRow[]).map(mapEventTier);
        setTiers(rows);
        const firstAvailable = rows.find((tr) => tierIsAvailable(tr)) ?? rows[0] ?? null;
        setSelectedTierId(firstAvailable?.id ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [event.id]);

  const tiered = tiers.length > 0;
  const selectedTier = tiered ? (tiers.find((tr) => tr.id === selectedTierId) ?? null) : null;
  const unitPrice = selectedTier ? selectedTier.price : event.price;

  // The sold count is the one number here that goes stale while the sheet sits
  // open - other people are buying the same show. Subscribe to this event's row
  // so the bar, "Almost gone" and the sold-out lock stay honest (#101). Seeded
  // from the event we were handed, so there's no flash and it works even before
  // the first realtime message.
  const { sold, capacity } = useLiveEventStats(
    event.id,
    { sold: event.sold, capacity: event.capacity },
    true
  );

  const soldPercent = Math.round((sold / capacity) * 100);
  const remaining = Math.max(capacity - sold, 0);
  const soldOut = remaining <= 0;
  const almostGone = !soldOut && soldPercent >= 90;

  // With tiers, the seats that matter for the stepper and the buy button are the
  // chosen tier's, not the event aggregate. A tier that's sold out or past its
  // cutoff blocks the buy even if other tiers (and the event) still have room.
  const tierRemaining = selectedTier
    ? Math.max(selectedTier.capacity - selectedTier.sold, 0)
    : remaining;
  // Types share the room pool (#151), so the seats actually buyable is the
  // smaller of this type's own remaining and the room's remaining.
  const sellableRemaining = tiered ? Math.min(tierRemaining, remaining) : remaining;
  // Whichever runs out first: the per-order cap (the chosen type's for a tiered
  // show, the event's otherwise) or the seats left.
  const perOrderCap = selectedTier ? selectedTier.maxPerOrder : event.maxPerOrder;
  const maxQuantity = Math.max(Math.min(sellableRemaining, perOrderCap), 1);
  const tierUnavailable = tiered && (!selectedTier || !tierIsAvailable(selectedTier));
  const buyBlocked = soldOut || tierUnavailable;

  const subtotal = unitPrice * quantity;
  const total = buyBlocked ? 0 : (discountedTotal ?? subtotal);

  function selectTier(id: string) {
    setSelectedTierId(id);
    setQuantity(1);
    setPromoLabel(null);
    setDiscountedTotal(null);
  }

  const externalUrl = event.ticketing?.mode === "external" ? event.ticketing.url : undefined;
  let externalHost = t("ticket.externalHostFallback");
  if (externalUrl) {
    try {
      externalHost = new URL(externalUrl).hostname.replace(/^www\./, "");
    } catch {
      // keep the generic fallback label
    }
  }

  async function handleApplyPromo() {
    if (!promoCode.trim()) return;
    setCheckingPromo(true);
    setPromoError(undefined);

    const result = await previewPromoCode(event.id, quantity, promoCode, selectedTierId);
    setCheckingPromo(false);

    if (result.error || result.totalEuros === undefined) {
      setPromoError(result.error ?? t("ticket.promoInvalid"));
      setPromoLabel(null);
      setDiscountedTotal(null);
      return;
    }
    setPromoLabel(result.label ?? null);
    setDiscountedTotal(result.totalEuros);
  }

  // Pricing, discount validation and ticket creation all happen server-side -
  // this only kicks it off and follows the redirect Stripe gives back. Free
  // tickets come back fulfilled with no redirect.
  async function handleBuy() {
    setBuying(true);
    setBuyError(undefined);

    const result = await createCheckout(event.id, quantity, promoCode.trim() || null, selectedTierId);

    if (result.error) {
      setBuying(false);
      setBuyError(result.error);
      return;
    }

    if (result.url) {
      window.location.href = result.url;
      return;
    }

    setBuying(false);
    setPurchased(true);
    onPurchased?.();
  }

  function handleBuyExternal() {
    // In the native shell this opens an in-app browser sheet (keeps the fan in
    // MadGigz, with a built-in "open in Safari" option); on the web it's a new
    // tab, unchanged. See openExternal.
    if (externalUrl) void openExternal(externalUrl);
  }

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/60"
      onClick={onClose}
    >
      <div
        className="max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-surface p-6 pb-10"
        style={sheetStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag the handle down to dismiss (#130). Kept off the scrollable body
            so it never fights the sheet's own overflow scrolling. */}
        <div {...handleProps} className="mx-auto -mt-3 mb-2 flex w-full justify-center pb-3 pt-3">
          <div className="h-1 w-10 rounded-full bg-muted/30" />
        </div>

        {purchased ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-full text-2xl"
              style={{ backgroundColor: event.accentColor }}
            >
              ✓
            </div>
            <h2 className="font-display text-2xl text-foreground">{t("ticket.goingTitle")}</h2>
            <p className="text-sm text-muted">
              {t("ticket.summary", {
                count: quantity,
                tickets: quantity === 1 ? t("ticket.one") : t("ticket.many"),
                title: event.title,
                venue: event.venue,
              })}
            </p>
            <Button className="mt-4" onClick={onClose}>
              {t("common.done")}
            </Button>
          </div>
        ) : (
          <>
            <div className="relative mb-4 aspect-[3/4] w-full overflow-hidden rounded-2xl bg-background">
              <Image src={event.image} alt={event.title} fill sizes="480px" className="object-contain" />
            </div>

            {/* Like and share both live here rather than on the cards behind
                it. This sheet is the one place every route into an event
                converges - Explore, This Week, For You - so one pair of controls
                covers all three, and they sit next to the show they act on
                rather than on a thumbnail of it. */}
            <div className="flex items-start justify-between gap-3">
              <h2 className="font-display text-2xl text-foreground">{event.title}</h2>
              <div className="flex shrink-0 items-start gap-4 pt-1">
                {onToggleLike && (
                  <LikeButton event={event} liked={liked} onToggle={onToggleLike} showLabel />
                )}
                <ShareEventButton event={event} showLabel />
              </div>
            </div>
            {event.artistId ? (
              <Link href={`/profile/${event.artistId}`} className="mt-1 inline-block text-sm text-accent">
                {event.artist}
              </Link>
            ) : (
              <p className="mt-1 text-sm text-muted">{event.artist}</p>
            )}
            <p className="text-sm text-muted">
              {event.venue} · {formatDate(event.date, dl)} · {event.time}
            </p>

            <div className="mt-5 flex gap-2 rounded-full bg-background p-1">
              <button
                onClick={() => setTab("tickets")}
                className={`flex-1 rounded-full py-2 text-sm font-heading ${
                  tab === "tickets" ? "bg-primary text-foreground" : "text-muted"
                }`}
              >
                {t("ticket.getTicketsTab")}
              </button>
              <button
                onClick={() => setTab("info")}
                className={`flex-1 rounded-full py-2 text-sm font-heading ${
                  tab === "info" ? "bg-primary text-foreground" : "text-muted"
                }`}
              >
                {t("ticket.moreInfoTab")}
              </button>
            </div>

            {tab === "tickets" && externalUrl ? (
              <div className="mt-6 flex flex-col gap-6">
                <div className="rounded-2xl border border-muted/20 bg-background p-4 text-sm text-muted">
                  {t("ticket.externalNote", { host: externalHost })}
                </div>
                <Button onClick={handleBuyExternal}>
                  {t("ticket.buyExternal", { host: externalHost })}
                </Button>
              </div>
            ) : tab === "tickets" ? (
              <div className="mt-6 flex flex-col gap-6">
                {/* Price tiers (#151): pick one before choosing a quantity.
                    Sold-out / past-cutoff tiers are shown but disabled. */}
                {tiered && (
                  <div className="flex flex-col gap-2">
                    <span className="font-heading text-sm text-muted">{t("ticket.chooseTier")}</span>
                    {tiers.map((tr) => {
                      // Unavailable if the type is exhausted/closed OR the shared
                      // room is full (#151).
                      const available = tierIsAvailable(tr) && !soldOut;
                      const selected = tr.id === selectedTierId;
                      const subline = !available
                        ? soldOut || tr.sold >= tr.capacity
                          ? t("ticket.tierSoldOut")
                          : t("ticket.tierClosed")
                        : tr.availableUntil
                          ? t("ticket.tierUntil", {
                              date: new Date(tr.availableUntil).toLocaleDateString(dl, {
                                day: "numeric",
                                month: "short",
                                timeZone: "UTC",
                              }),
                            })
                          : null;
                      return (
                        <button
                          key={tr.id}
                          type="button"
                          onClick={() => available && selectTier(tr.id)}
                          disabled={!available}
                          className={`flex items-center justify-between rounded-2xl border px-4 py-3 text-left transition-colors ${
                            selected ? "border-primary bg-primary/10" : "border-muted/20 bg-background"
                          } disabled:opacity-40`}
                        >
                          <span className="min-w-0">
                            <span className="block font-heading text-sm text-foreground">{tr.name}</span>
                            {subline && <span className="block text-xs text-muted">{subline}</span>}
                          </span>
                          <span className="shrink-0 font-display text-foreground">
                            €{tr.price.toFixed(2)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between">
                  <span className="font-heading text-sm text-muted">{t("ticket.quantity")}</span>
                  <div className="flex items-center gap-4">
                    <button
                      onClick={() => {
                        setQuantity((q) => Math.max(1, q - 1));
                        setPromoLabel(null);
                        setDiscountedTotal(null);
                      }}
                      disabled={buyBlocked}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/30 text-foreground disabled:opacity-30"
                    >
                      −
                    </button>
                    <span className="w-4 text-center font-display text-lg text-foreground">
                      {buyBlocked ? 0 : quantity}
                    </span>
                    <button
                      onClick={() => {
                        setQuantity((q) => Math.min(maxQuantity, q + 1));
                        setPromoLabel(null);
                        setDiscountedTotal(null);
                      }}
                      disabled={buyBlocked}
                      className="flex h-9 w-9 items-center justify-center rounded-full border border-muted/30 text-foreground disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/20">
                    <div
                      className="h-full rounded-full"
                      style={{ width: `${soldPercent}%`, backgroundColor: event.accentColor }}
                    />
                  </div>
                  {soldOut ? (
                    <p className="mt-2 text-xs text-danger">{t("ticket.soldOutBar")}</p>
                  ) : (
                    almostGone && (
                      <p className="mt-2 text-xs text-danger">
                        {t("ticket.almostGone", { remaining })}
                      </p>
                    )
                  )}
                </div>

                {!buyBlocked && !isGuest && (
                  <div className="flex flex-col gap-1.5">
                    <span className="font-heading text-sm text-muted">{t("ticket.promoCode")}</span>
                    <div className="flex gap-2">
                      <input
                        value={promoCode}
                        onChange={(e) => {
                          setPromoCode(e.target.value);
                          setPromoLabel(null);
                          setDiscountedTotal(null);
                        }}
                        placeholder={t("ticket.promoPlaceholder")}
                        className="min-w-0 flex-1 rounded-2xl border border-muted/20 bg-background px-4 py-3 text-foreground placeholder:text-muted/60 focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                      <button
                        type="button"
                        onClick={handleApplyPromo}
                        disabled={checkingPromo || !promoCode.trim()}
                        className="shrink-0 rounded-2xl border border-muted/30 px-4 text-sm font-heading text-foreground disabled:opacity-40"
                      >
                        {checkingPromo ? "..." : t("ticket.apply")}
                      </button>
                    </div>
                    {promoError && <p className="text-sm text-danger">{promoError}</p>}
                    {promoLabel && <p className="text-sm text-accent">{promoLabel}</p>}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-muted/15 pt-4">
                  <span className="font-heading text-muted">{t("ticket.total")}</span>
                  <span className="font-display text-xl text-foreground">€{total.toFixed(2)}</span>
                </div>
                {buyError && <p className="text-sm text-danger">{buyError}</p>}

                {/* Auto-detected from the Stripe key, so it shows for the
                    test-mode soft launch and vanishes the moment live keys are
                    set. Only for paid tickets - free ones never touch Stripe. */}
                {isTestMode && !buyBlocked && total > 0 && (
                  <div className="rounded-2xl bg-accent-dark/20 px-4 py-3 text-xs leading-relaxed text-foreground">
                    {t("ticket.testMode")}
                  </div>
                )}

                {isGuest && !buyBlocked ? (
                  // No account, nowhere to issue a ticket - send them to sign in
                  // and back to this show's page (where they can complete it).
                  <Link
                    href={`/signin?next=${encodeURIComponent(eventPath(event.id))}`}
                    className="block"
                  >
                    <Button>{t("publicEvent.signInToBuy")}</Button>
                  </Link>
                ) : (
                  <Button onClick={handleBuy} disabled={buyBlocked || buying}>
                    {buyBlocked
                      ? t("ticket.buySoldOut")
                      : buying
                        ? t("ticket.buyStarting")
                        : total === 0
                          ? t("ticket.buyFree")
                          : t("ticket.buyPay")}
                  </Button>
                )}

                {/* Visible, not tapped-for: a fan deciding whether to buy needs
                    this before they pay, not tucked behind an icon they'd have
                    no reason to tap. */}
                {!buyBlocked && (
                  <LegalNotice
                    messageKey="ticket.finalSale"
                    className="-mt-3 text-center text-[11px] text-muted"
                  />
                )}
              </div>
            ) : (
              <div className="mt-6 flex flex-col gap-5">
                <p className="text-sm text-foreground/90">{event.description}</p>

                <div>
                  <h3 className="font-heading text-sm text-muted">{t("ticket.lineup")}</h3>
                  <ol className="mt-2 flex flex-col gap-1.5">
                    {event.lineup.map((act, i) => (
                      <li key={act} className="flex items-baseline gap-2 text-sm text-foreground">
                        <span className="text-muted">{i + 1}.</span>
                        <span className={i === 0 ? "font-heading" : undefined}>{act}</span>
                        {i === 0 && (
                          <span className="text-xs uppercase text-muted">{t("ticket.headliner")}</span>
                        )}
                      </li>
                    ))}
                  </ol>
                </div>

                <div className="grid grid-cols-2 gap-4 border-t border-muted/15 pt-4 text-sm">
                  <div>
                    <p className="text-muted">{t("ticket.venue")}</p>
                    <p className="text-foreground">{event.venue}</p>
                  </div>
                  <div>
                    <p className="text-muted">{t("ticket.doors")}</p>
                    <p className="text-foreground">{event.doors}</p>
                  </div>
                  <div>
                    <p className="text-muted">{t("ticket.age")}</p>
                    <p className="text-foreground">{event.ageRestriction}</p>
                  </div>
                  {/* "Rating" was here, rendering event.rating as "0.0 / 5".
                      Nothing in the app has ever written a rating - both places
                      that create an event hard-code 0 - so every show was
                      advertising itself as nought out of five to anyone who
                      opened More Info. The column survives from the original
                      prototype spec; it stays in the database untouched, but it
                      has no business on screen until something can actually
                      produce a number. */}
                </div>

                <Button onClick={() => setTab("tickets")}>{t("ticket.getTicketsTab")}</Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
