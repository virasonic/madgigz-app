import { readJSON, removeKey, writeJSON } from "./storage";

export type Role = "fan" | "artist";

export interface MockUser {
  username: string;
  role: Role;
}

export interface Ticket {
  id: string;
  eventId: string;
  quantity: number;
  purchasedAt: string; // ISO timestamp
}

const USER_KEY = "madgigz_user";
const SAVED_KEY = "madgigz_saved";
const TICKETS_KEY = "madgigz_tickets";
const ACCOUNTS_KEY = "madgigz_accounts";
const CHECKINS_KEY = "madgigz_checkins";

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

export function addTicket(data: Omit<Ticket, "id">): Ticket {
  const ticket: Ticket = {
    ...data,
    id: `ticket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  };
  writeJSON(TICKETS_KEY, [...getTickets(), ticket]);
  return ticket;
}

// Mock door check-ins, standing in for a shared backend - see the Stage 4
// plan note: this only works within one browser until there's a real server
// for a scanner on a different device to check a ticket against.
export function getCheckIns(): string[] {
  return readJSON<string[]>(CHECKINS_KEY, []);
}

export function isCheckedIn(ticketId: string): boolean {
  return getCheckIns().includes(ticketId);
}

export function addCheckIn(ticketId: string): string[] {
  const current = getCheckIns();
  if (current.includes(ticketId)) return current;
  const next = [...current, ticketId];
  writeJSON(CHECKINS_KEY, next);
  return next;
}
