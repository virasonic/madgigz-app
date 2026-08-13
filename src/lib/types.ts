export type Role = "fan" | "artist" | "admin";
export type ArtistStatus = "pending" | "approved" | "rejected";

export interface Ticketing {
  mode: "internal" | "external";
  url?: string;
}

export interface Venue {
  id: string;
  name: string;
  address: string | null;
  city: string;
  postalCode: string | null;
  capacity: number | null;
  verified: boolean;
  active: boolean;
}

export interface VenueRow {
  id: string;
  name: string;
  address: string | null;
  city: string;
  postal_code: string | null;
  capacity: number | null;
  verified: boolean;
  active: boolean;
}

export function mapVenue(row: VenueRow): Venue {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    postalCode: row.postal_code,
    capacity: row.capacity,
    verified: row.verified,
    active: row.active,
  };
}

export interface Genre {
  id: string;
  name: string;
}

export interface EventItem {
  id: string;
  artistId: string | null;
  venueId: string | null;
  title: string;
  artist: string;
  venue: string;
  // Joined from the venue row. Null for a show whose venue was typed in before
  // the venues table existed, or one an admin hasn't given an address yet.
  venueAddress: string | null;
  city: string;
  date: string;
  time: string;
  price: number;
  currency: "EUR";
  accentColor: string;
  category: string;
  image: string;
  capacity: number;
  sold: number;
  description: string;
  lineup: string[];
  doors: string;
  ageRestriction: string;
  rating: number;
  active: boolean;
  cancelled: boolean;
  maxPerOrder: number;
  ticketing?: Ticketing;
}

export interface ContentPost {
  id: string;
  /**
   * Null for a MadGigz announcement - a post that belongs to the platform
   * rather than to a show. See addendum_028: the absence of an event IS the
   * distinction, which is why there is no separate flag to keep in step.
   */
  eventId: string | null;
  artistId: string | null;
  artist: string;
  /**
   * The artist's profile picture, for the reel avatar (#123). Null for a
   * MadGigz announcement (no artist) or an artist who hasn't set a photo -
   * ContentReelCard falls back to the note icon in both cases.
   */
  artistPhotoUrl: string | null;
  showTitle: string;
  caption: string;
  image: string;
  mediaType: "image" | "video" | "text";
  videoUrl?: string;
  /**
   * Cloudflare Stream video id (#138, addendum_035). Present on video posts
   * uploaded after the Stream cutover; playback + poster URLs are derived from
   * it. Null on legacy videos, which keep playing their Supabase `videoUrl`.
   */
  streamUid?: string | null;
  /** Text announcements only (addendum_029): rendered on the brand template. */
  headline?: string | null;
  accentColor?: string | null;
}

export interface Ticket {
  id: string;
  userId: string;
  eventId: string;
  quantity: number;
  pricePaid: number;
  discountId: string | null;
  purchasedAt: string;
  checkedInAt: string | null;
  refunded: boolean;
  hiddenAt: string | null;
}

export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  artistName: string | null;
  artistBio: string | null;
  artistPhotoUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
  artistStatus: ArtistStatus | null;
  evidenceSubmitted: boolean;
  followerCount: number;
  // Whether a Stripe account exists, not which one. The id itself is
  // service-role-only (addendum_018) and the UI only ever needed the boolean.
  stripeAccountConnected: boolean;
  stripePayoutsReady: boolean;
}

// The subset of a profile that's safe and meaningful to show to someone
// browsing a different artist's public page - no email, no Stripe fields, no
// evidence (that's private verification material, not a public credential).
export interface PublicArtistProfile {
  id: string;
  username: string;
  followerCount: number;
  artistName: string;
  artistBio: string | null;
  artistPhotoUrl: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
}

export interface Discount {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  eventId: string | null;
  maxUses: number | null;
  usedCount: number;
  expiresAt: string | null;
  active: boolean;
}

// ---- Row mappers: Postgres snake_case -> the camelCase shapes above ----

export interface EventRow {
  id: string;
  artist_id: string | null;
  venue_id: string | null;
  title: string;
  artist_name: string;
  venue: string;
  city: string;
  event_date: string;
  event_time: string;
  price: number;
  currency: string;
  accent_color: string;
  category: string;
  image_url: string | null;
  capacity: number;
  sold: number;
  description: string;
  lineup: string[];
  doors: string | null;
  age_restriction: string;
  rating: number;
  ticketing_mode: "internal" | "external";
  ticketing_url: string | null;
  // PostgREST embed of the joined venue row. Absent on queries that don't ask
  // for it, so treated as optional rather than assumed.
  venues?: { address: string | null } | null;
  active?: boolean;
  cancelled?: boolean;
  max_per_order?: number;
}

export function mapEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    artistId: row.artist_id,
    venueId: row.venue_id ?? null,
    title: row.title,
    artist: row.artist_name,
    venue: row.venue,
    venueAddress: row.venues?.address ?? null,
    city: row.city,
    date: row.event_date,
    time: row.event_time,
    price: Number(row.price),
    currency: "EUR",
    accentColor: row.accent_color,
    category: row.category,
    image: row.image_url ?? "",
    capacity: row.capacity,
    sold: row.sold,
    description: row.description,
    lineup: row.lineup,
    doors: row.doors ?? row.event_time,
    ageRestriction: row.age_restriction,
    rating: Number(row.rating),
    active: row.active ?? true,
    cancelled: row.cancelled ?? false,
    maxPerOrder: row.max_per_order ?? 6,
    ticketing:
      row.ticketing_mode === "external"
        ? { mode: "external", url: row.ticketing_url ?? undefined }
        : undefined,
  };
}

export interface ContentPostRow {
  id: string;
  event_id: string | null;
  artist_id: string | null;
  artist_name: string;
  show_title: string;
  caption: string;
  media_url: string | null;
  media_type: "image" | "video" | "text";
  // Undefined until addendum_035 runs (queries use select("*"), so the column
  // simply isn't there yet) — mapContentPost reads it as null. Graceful.
  stream_uid?: string | null;
  headline?: string | null;
  accent_color?: string | null;
  /**
   * Embedded from the artist_id -> profiles FK (#123). Present only when the
   * query asks for it (fetchContentPosts/fetchShowContent do; the admin
   * moderation query's plain select("*") leaves it undefined -> null photo,
   * which is fine there).
   */
  profiles?: { artist_photo_url: string | null } | null;
}

export function mapContentPost(row: ContentPostRow): ContentPost {
  return {
    id: row.id,
    eventId: row.event_id,
    artistId: row.artist_id,
    artist: row.artist_name,
    artistPhotoUrl: row.profiles?.artist_photo_url ?? null,
    showTitle: row.show_title,
    caption: row.caption,
    image: row.media_type === "image" ? (row.media_url ?? "") : "",
    mediaType: row.media_type,
    videoUrl: row.media_type === "video" ? (row.media_url ?? undefined) : undefined,
    streamUid: row.stream_uid ?? null,
    headline: row.headline ?? null,
    accentColor: row.accent_color ?? null,
  };
}

export interface TicketRow {
  id: string;
  user_id: string;
  event_id: string;
  quantity: number;
  price_paid: number;
  discount_id: string | null;
  purchased_at: string;
  checked_in_at: string | null;
  refunded: boolean;
  hidden_at?: string | null;
}

export function mapTicket(row: TicketRow): Ticket {
  return {
    id: row.id,
    userId: row.user_id,
    eventId: row.event_id,
    quantity: row.quantity,
    pricePaid: Number(row.price_paid),
    discountId: row.discount_id,
    purchasedAt: row.purchased_at,
    checkedInAt: row.checked_in_at,
    refunded: row.refunded,
    hiddenAt: row.hidden_at ?? null,
  };
}

export interface ProfileRow {
  id: string;
  username: string;
  role: Role;
  artist_name: string | null;
  artist_bio: string | null;
  artist_photo_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
  artist_status: ArtistStatus | null;
  evidence_submitted: boolean | null;
  follower_count: number | null;
  stripe_account_connected: boolean | null;
  stripe_payouts_ready: boolean | null;
}

export function mapProfile(row: ProfileRow, email: string): AppUser {
  return {
    id: row.id,
    email,
    username: row.username,
    role: row.role,
    artistName: row.artist_name,
    artistBio: row.artist_bio,
    artistPhotoUrl: row.artist_photo_url,
    instagram: row.instagram,
    tiktok: row.tiktok,
    twitter: row.twitter,
    spotify: row.spotify,
    artistStatus: row.artist_status,
    evidenceSubmitted: Boolean(row.evidence_submitted),
    followerCount: row.follower_count ?? 0,
    stripeAccountConnected: Boolean(row.stripe_account_connected),
    stripePayoutsReady: row.stripe_payouts_ready ?? false,
    youtube: row.youtube,
  };
}

// Row shape for the public-profile query - a narrower select than the full
// ProfileRow above (no email/Stripe/evidence columns to leak).
export interface PublicArtistProfileRow {
  id: string;
  username: string;
  follower_count: number | null;
  artist_name: string | null;
  artist_bio: string | null;
  artist_photo_url: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
}

export function mapPublicArtistProfile(row: PublicArtistProfileRow): PublicArtistProfile {
  return {
    id: row.id,
    username: row.username,
    // Null while addendum_021 hasn't run - treat as zero rather than rendering
    // "null followers".
    followerCount: row.follower_count ?? 0,
    artistName: row.artist_name ?? row.username,
    artistBio: row.artist_bio,
    artistPhotoUrl: row.artist_photo_url,
    instagram: row.instagram,
    tiktok: row.tiktok,
    twitter: row.twitter,
    spotify: row.spotify,
    youtube: row.youtube,
  };
}

export interface DiscountRow {
  id: string;
  code: string;
  type: "percent" | "fixed";
  value: number;
  event_id: string | null;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
}

export function mapDiscount(row: DiscountRow): Discount {
  return {
    id: row.id,
    code: row.code,
    type: row.type,
    value: Number(row.value),
    eventId: row.event_id,
    maxUses: row.max_uses,
    usedCount: row.used_count,
    expiresAt: row.expires_at,
    active: row.active,
  };
}
