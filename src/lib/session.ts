import { readJSON, removeKey, writeJSON } from "./storage";

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
const ACCOUNTS_KEY = "madgigz_accounts";

export function getMockUser(): MockUser | null {
  return readJSON<MockUser | null>(USER_KEY, null);
}

export function setMockUser(user: MockUser) {
  writeJSON(USER_KEY, user);
}

export function clearMockUser() {
  removeKey(USER_KEY);
}

// Mock "accounts" so sign-in can restore the right role without a real backend.
export function rememberAccount(username: string, role: Role) {
  const accounts = readJSON<Record<string, Role>>(ACCOUNTS_KEY, {});
  accounts[username] = role;
  writeJSON(ACCOUNTS_KEY, accounts);
}

export function lookupRole(username: string): Role {
  const accounts = readJSON<Record<string, Role>>(ACCOUNTS_KEY, {});
  return accounts[username] ?? "fan";
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
