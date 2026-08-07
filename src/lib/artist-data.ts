import { ContentPost, EventItem, contentPosts, events } from "./mock-data";
import { readJSON, writeJSON } from "./storage";

export interface ArtistProfileInfo {
  artistName: string;
  instagram?: string;
  tiktok?: string;
  twitter?: string;
  spotify?: string;
  youtube?: string;
}

// A Show is structurally identical to EventItem so it's a drop-in for
// EventCard/TicketModal/ContentReelCard - artist-created shows are real,
// ticket-buyable events for fans, not a separate artist-only sandbox.
export type Show = EventItem;

const SHOWS_KEY = "madgigz_shows";
const CONTENT_KEY = "madgigz_artist_content";
const PROFILE_KEY = "madgigz_artist_profile";

export function getArtistProfile(): ArtistProfileInfo | null {
  return readJSON<ArtistProfileInfo | null>(PROFILE_KEY, null);
}

export function setArtistProfile(profile: ArtistProfileInfo) {
  writeJSON(PROFILE_KEY, profile);
}

export function getShows(): Show[] {
  return readJSON<Show[]>(SHOWS_KEY, []);
}

export function addShow(data: Omit<Show, "id" | "sold">): Show {
  const show: Show = {
    ...data,
    id: `show-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sold: 0,
  };
  writeJSON(SHOWS_KEY, [...getShows(), show]);
  return show;
}

// Mock events + artist-created shows - everywhere fans browse events should
// read from this, not the static mock list, so a new show is a real event.
export function getAllEvents(): EventItem[] {
  return [...events, ...getShows()];
}

export function getShowContent(showId: string): ContentPost[] {
  const all = readJSON<ContentPost[]>(CONTENT_KEY, []);
  return all.filter((post) => post.eventId === showId);
}

export function addShowContent(
  showId: string,
  artistName: string,
  showTitle: string,
  caption: string
): ContentPost {
  const all = readJSON<ContentPost[]>(CONTENT_KEY, []);
  const post: ContentPost = {
    id: `post-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    eventId: showId,
    artist: artistName,
    showTitle,
    caption,
    image: `https://picsum.photos/seed/${showId}-${all.length}/800/1200`,
    mediaType: "image",
  };
  writeJSON(CONTENT_KEY, [...all, post]);
  return post;
}

// Mock content + artist-posted content - Feed's For You reads from this so a
// freshly-posted update shows up immediately, matching the original spec.
export function getAllContentPosts(): ContentPost[] {
  return [...contentPosts, ...readJSON<ContentPost[]>(CONTENT_KEY, [])];
}
