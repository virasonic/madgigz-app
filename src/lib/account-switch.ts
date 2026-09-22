// Server-only by convention (imported solely by server actions, a route handler
// and server components) — this repo doesn't carry the `server-only` package, so
// the guard is the import graph, not a runtime marker.
//
// Multi-account switcher (admin-only convenience): remember the sessions of
// accounts an admin has actually signed into on this device, so they can hop
// between them without logging out and back in. NOT impersonation — every
// account in the store got there through a real login, and switching just
// swaps the active Supabase session to a refresh token we already hold
// (auth-js documents refreshSession({ refresh_token }) for exactly this). The
// separate admin impersonation path (src/app/admin/users/impersonation-actions)
// is a different, service-role feature and stays untouched.
//
// The store holds refresh tokens — the same class of secret as the live `sb-`
// auth cookie already on the device — so all three cookies are httpOnly,
// server-set, and cleared on sign-out. Only an admin can populate the store
// (beginAddAccount checks it), and the owner cookie records which admin set it
// up so switching keeps working while "acting as" a non-admin account without
// letting a plain fan build a store of their own.

// The remembered sessions: [{ id, rt }]. Refresh tokens only — an access token
// expires in an hour, and refreshSession mints a fresh one from the refresh
// token on switch.
export const SWITCH_STORE_COOKIE = "mg-switch";
// The admin id that set the switcher up. Gates every store operation.
export const SWITCH_OWNER_COOKIE = "mg-switch-owner";
// Set while an "add account" round-trip through sign-in is in flight, so the
// return handler knows to stash the account that was just signed into.
export const SWITCH_PENDING_COOKIE = "mg-switch-add";

const STORE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days
const PENDING_MAX_AGE = 60 * 10; // the add round-trip is seconds; 10 min is slack
// A hard ceiling on how many accounts we'll remember, so the cookie can't grow
// unbounded (refresh tokens are short, but a cookie still has a ~4KB budget).
const MAX_ACCOUNTS = 8;

export interface StoredAccount {
  /** Supabase auth user id. */
  id: string;
  /** The account's refresh token (opaque). */
  rt: string;
}

// The subset of Next's cookie store we use. Both `cookies()` (server actions,
// route handlers) and the request cookies satisfy it.
interface CookieStore {
  get(name: string): { value: string } | undefined;
  set(name: string, value: string, options?: Record<string, unknown>): void;
  delete(name: string): void;
}

function options(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export function readStore(store: CookieStore): StoredAccount[] {
  const raw = store.get(SWITCH_STORE_COOKIE)?.value;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defend against a malformed/tampered cookie: keep only well-formed entries.
    return parsed
      .filter(
        (e): e is StoredAccount =>
          !!e && typeof e.id === "string" && typeof e.rt === "string"
      )
      .slice(0, MAX_ACCOUNTS);
  } catch {
    return [];
  }
}

export function writeStore(store: CookieStore, list: StoredAccount[]): void {
  const trimmed = list.slice(0, MAX_ACCOUNTS);
  if (trimmed.length === 0) {
    store.delete(SWITCH_STORE_COOKIE);
    return;
  }
  store.set(SWITCH_STORE_COOKIE, JSON.stringify(trimmed), options(STORE_MAX_AGE));
}

// Replace an account's entry (matched by id) or append it — most-recent last,
// but capped so the oldest drops out rather than overflowing the cookie.
export function upsertAccount(list: StoredAccount[], account: StoredAccount): StoredAccount[] {
  const without = list.filter((a) => a.id !== account.id);
  return [...without, account].slice(-MAX_ACCOUNTS);
}

export function removeAccount(list: StoredAccount[], id: string): StoredAccount[] {
  return list.filter((a) => a.id !== id);
}

export function getOwner(store: CookieStore): string | null {
  return store.get(SWITCH_OWNER_COOKIE)?.value ?? null;
}

export function setOwner(store: CookieStore, adminId: string): void {
  store.set(SWITCH_OWNER_COOKIE, adminId, options(STORE_MAX_AGE));
}

export function setPending(store: CookieStore): void {
  store.set(SWITCH_PENDING_COOKIE, "1", options(PENDING_MAX_AGE));
}

export function isPending(store: CookieStore): boolean {
  return store.get(SWITCH_PENDING_COOKIE)?.value === "1";
}

export function clearPending(store: CookieStore): void {
  store.delete(SWITCH_PENDING_COOKIE);
}

// Wipe every trace of the switcher. Called on sign-out so one person's remembered
// logins never carry over to the next.
export function clearSwitch(store: CookieStore): void {
  store.delete(SWITCH_STORE_COOKIE);
  store.delete(SWITCH_OWNER_COOKIE);
  store.delete(SWITCH_PENDING_COOKIE);
}
