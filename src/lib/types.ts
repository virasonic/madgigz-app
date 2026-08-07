export type Role = "fan" | "artist" | "admin";

export interface Ticketing {
  mode: "internal" | "external";
  url?: string;
}

export interface EventItem {
  id: string;
  artistId: string | null;
  title: string;
  artist: string;
  venue: string;
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
  ticketing?: Ticketing;
}

export interface ContentPost {
  id: string;
  eventId: string;
  artist: string;
  showTitle: string;
  caption: string;
  image: string;
  mediaType: "image" | "video";
  videoUrl?: string;
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
}

export interface AppUser {
  id: string;
  email: string;
  username: string;
  role: Role;
  artistName: string | null;
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
  active?: boolean;
}

export function mapEvent(row: EventRow): EventItem {
  return {
    id: row.id,
    artistId: row.artist_id,
    title: row.title,
    artist: row.artist_name,
    venue: row.venue,
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
    ticketing:
      row.ticketing_mode === "external"
        ? { mode: "external", url: row.ticketing_url ?? undefined }
        : undefined,
  };
}

export interface ContentPostRow {
  id: string;
  event_id: string;
  artist_name: string;
  show_title: string;
  caption: string;
  media_url: string;
  media_type: "image" | "video";
}

export function mapContentPost(row: ContentPostRow): ContentPost {
  return {
    id: row.id,
    eventId: row.event_id,
    artist: row.artist_name,
    showTitle: row.show_title,
    caption: row.caption,
    image: row.media_type === "image" ? row.media_url : "",
    mediaType: row.media_type,
    videoUrl: row.media_type === "video" ? row.media_url : undefined,
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
  };
}

export interface ProfileRow {
  id: string;
  username: string;
  role: Role;
  artist_name: string | null;
  instagram: string | null;
  tiktok: string | null;
  twitter: string | null;
  spotify: string | null;
  youtube: string | null;
}

export function mapProfile(row: ProfileRow, email: string): AppUser {
  return {
    id: row.id,
    email,
    username: row.username,
    role: row.role,
    artistName: row.artist_name,
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
