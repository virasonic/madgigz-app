export type Role = "fan" | "artist";

export interface MockUser {
  username: string;
  role: Role;
}

export interface Ticket {
  eventId: string;
  quantity: number;
  purchasedAt: string; // ISO timestamp
}

const USER_KEY = "madgigz_user";
const SAVED_KEY = "madgigz_saved";
const TICKETS_KEY = "madgigz_tickets";

function readJSON<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getMockUser(): MockUser | null {
  return readJSON<MockUser | null>(USER_KEY, null);
}

export function setMockUser(user: MockUser) {
  writeJSON(USER_KEY, user);
}

export function clearMockUser() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(USER_KEY);
}

export function getSavedEventIds(): string[] {
  return readJSON<string[]>(SAVED_KEY, []);
}

export function toggleSaved(eventId: string): string[] {
  const current = getSavedEventIds();
  const next = current.includes(eventId)
    ? current.filter((id) => id !== eventId)
    : [...current, eventId];
  writeJSON(SAVED_KEY, next);
  return next;
}

export function getTickets(): Ticket[] {
  return readJSON<Ticket[]>(TICKETS_KEY, []);
}

export function addTicket(ticket: Ticket): Ticket[] {
  const next = [...getTickets(), ticket];
  writeJSON(TICKETS_KEY, next);
  return next;
}
