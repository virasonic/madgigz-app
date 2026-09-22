"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import {
  clearPending,
  clearSwitch,
  getOwner,
  isPending,
  readStore,
  removeAccount,
  setOwner,
  setPending,
  upsertAccount,
  writeStore,
} from "@/lib/account-switch";

// role is granted to authenticated/anon (Explore reads it for guests), so this
// works even from a session that isn't itself an admin — which is the point:
// the owner check below must hold while "acting as" a fan account.
async function roleOf(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("role").eq("id", userId).single();
  return (data?.role as string | undefined) ?? null;
}

// Every store operation is gated on the OWNER — the admin who set the switcher
// up — not the currently-active session. That lets an admin who has switched
// into a fan account switch back out, while a plain fan (no owner cookie, and
// no way to set one without an admin session) can never build a store.
async function requireSwitchOwner(
  supabase: SupabaseClient,
  store: Awaited<ReturnType<typeof cookies>>
): Promise<void> {
  const owner = getOwner(store);
  if (!owner) throw new Error("Account switching isn't set up on this device.");
  if ((await roleOf(supabase, owner)) !== "admin") {
    throw new Error("Account switching is admin-only.");
  }
}

// Start adding another account. Stashes the current session so we can return to
// it, marks this browser as an admin's switcher, then sends the browser through
// the normal sign-in (all methods work) with a return hop that stashes whatever
// account gets signed into. Admin-only: this is the only door into the store.
export async function beginAddAccount(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  if ((await roleOf(supabase, user.id)) !== "admin") {
    throw new Error("Account switching is admin-only.");
  }

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const store = await cookies();
  if (session?.refresh_token) {
    writeStore(store, upsertAccount(readStore(store), { id: user.id, rt: session.refresh_token }));
  }
  setOwner(store, user.id);
  setPending(store);

  // Back to /account after sign-in; finishAddIfPending (called on mount there)
  // stashes whatever account was just signed into. We return to a real page, not
  // a route handler, because sign-in navigates with a soft router.push that
  // wouldn't follow a handler's redirect.
  redirect(`/signin?next=${encodeURIComponent("/account")}`);
}

// Stash the account that was just signed into during an "add" round-trip, if one
// is in flight. Called from the switcher page on mount (a client-triggered
// server action, so it can write the cookie a server component can't). Returns
// whether it actually added something, so the client only refreshes then.
export async function finishAddIfPending(): Promise<boolean> {
  const store = await cookies();
  if (!getOwner(store) || !isPending(store)) return false;

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session?.user?.id && session.refresh_token) {
    writeStore(
      store,
      upsertAccount(readStore(store), { id: session.user.id, rt: session.refresh_token })
    );
  }
  clearPending(store);
  return true;
}

// Swap the live session to a remembered account. No password: we mint a fresh
// session from the refresh token we already hold (auth-js documents
// refreshSession({ refresh_token }) as the multi-account-switch path).
// Returns an error code on an expected failure (a lapsed saved login) rather
// than throwing — a thrown server-action message is redacted to a generic
// string in production, and the client needs to tell "expired" from the rest.
// On success it redirects and never returns.
export async function switchToAccount(
  targetId: string
): Promise<{ error: "expired" } | void> {
  const supabase = await createClient();
  const store = await cookies();
  await requireSwitchOwner(supabase, store);

  // Capture the account we're leaving with its LIVE refresh token — the stored
  // one may have rotated while it was the active session — so we can come back.
  const {
    data: { session: current },
  } = await supabase.auth.getSession();
  let list = readStore(store);
  if (current?.user?.id && current.refresh_token) {
    list = upsertAccount(list, { id: current.user.id, rt: current.refresh_token });
  }

  const target = list.find((a) => a.id === targetId);
  if (!target) return { error: "expired" };

  const { data, error } = await supabase.auth.refreshSession({ refresh_token: target.rt });
  if (error || !data.session) {
    // The saved login expired or was revoked. Drop it so the list stays honest,
    // and tell the client to say "add it again" rather than fail opaquely.
    writeStore(store, removeAccount(list, targetId));
    return { error: "expired" };
  }

  // refreshSession rotated the token; keep the store current for next time.
  writeStore(store, upsertAccount(list, { id: targetId, rt: data.session.refresh_token }));

  redirect("/feed");
}

// Forget a remembered account (does not sign it out anywhere else — just drops
// the token from this device's store).
export async function forgetAccount(targetId: string): Promise<void> {
  const supabase = await createClient();
  const store = await cookies();
  await requireSwitchOwner(supabase, store);
  writeStore(store, removeAccount(readStore(store), targetId));
  revalidatePath("/account");
}

// Clear the whole switcher. Called from the sign-out handler so remembered
// logins never linger for the next person on the device. No auth check — it
// only deletes this browser's own cookies.
export async function clearSwitchOnSignOut(): Promise<void> {
  clearSwitch(await cookies());
}
