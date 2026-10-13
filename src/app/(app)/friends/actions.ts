"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { FanCard } from "@/lib/friends";

// #149: friend requests are written with the caller's OWN client, so the RLS
// policies on friendships (and the accept RPC's auth.uid() checks) are the
// enforcement. Routing any of this through the service role would remove the
// only thing stopping one person befriending on another's behalf.

type Result = { ok: boolean; error?: string };

function pair(me: string, other: string) {
  return me < other ? { user_a: me, user_b: other } : { user_a: other, user_b: me };
}

function refresh() {
  revalidatePath("/friends");
  revalidatePath("/friends/find");
  revalidatePath("/notifications");
  revalidatePath("/profile/[artistId]", "page");
}

export async function sendFriendRequest(otherId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };
  if (user.id === otherId) return { ok: false, error: "self" };

  const { error } = await supabase
    .from("friendships")
    .insert({ ...pair(user.id, otherId), requested_by: user.id, status: "pending" });

  // 23505 = a row already exists for this pair (they asked first, or it's
  // already accepted). The end state is what was wanted either way.
  if (error && error.code !== "23505") {
    console.error("sendFriendRequest failed:", error);
    return { ok: false, error: "failed" };
  }
  refresh();
  return { ok: true };
}

export async function acceptFriendRequest(requesterId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const { data, error } = await supabase.rpc("accept_friend_request", {
    p_requester: requesterId,
  });
  if (error) {
    console.error("acceptFriendRequest failed:", error);
    return { ok: false, error: "failed" };
  }
  // The function returns false when there was no pending request to accept
  // (withdrawn, or already accepted) - the read-back the probes insist on.
  if (!data) return { ok: false, error: "gone" };
  refresh();
  return { ok: true };
}

/** Decline a request, withdraw one you sent, or unfriend: one delete. */
export async function removeFriend(otherId: string): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  const p = pair(user.id, otherId);
  // .select() so a refusal is visible: a delete blocked by RLS matches zero
  // rows and returns no error.
  const { data, error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_a", p.user_a)
    .eq("user_b", p.user_b)
    .select("user_a");
  if (error) {
    console.error("removeFriend failed:", error);
    return { ok: false, error: "failed" };
  }
  if ((data?.length ?? 0) === 0) return { ok: false, error: "gone" };
  refresh();
  return { ok: true };
}

/**
 * Username search for Find friends. Usernames and avatars are public columns
 * (anyone with the anon key can list them already), so this adds no exposure;
 * the three-character minimum and the cap just keep it from being a directory.
 */
export async function searchFans(query: string): Promise<FanCard[]> {
  const q = query.trim();
  if (q.length < 3) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // ilike treats _ and % as wildcards and a username can contain _, so escape.
  const escaped = q.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data } = await supabase
    .from("profiles")
    .select("id, username, artist_photo_url")
    .ilike("username", `%${escaped}%`)
    .neq("id", user.id)
    .order("username")
    .limit(10);
  return ((data ?? []) as { id: string; username: string; artist_photo_url: string | null }[]).map(
    (r) => ({ id: r.id, username: r.username, photoUrl: r.artist_photo_url })
  );
}

export async function setShareInterested(value: boolean): Promise<Result> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not_signed_in" };

  // Only this column: on a row that already holds discovery preferences the
  // upsert leaves the arrays alone, and on a missing row the defaults apply.
  const { error } = await supabase
    .from("fan_preferences")
    .upsert({ user_id: user.id, share_interested: value, updated_at: new Date().toISOString() });
  if (error) {
    console.error("setShareInterested failed:", error);
    return { ok: false, error: "failed" };
  }
  revalidatePath("/friends");
  return { ok: true };
}
