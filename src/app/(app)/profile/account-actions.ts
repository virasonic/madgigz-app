"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DeletionBlocker,
  GRACE_PERIOD_DAYS,
  findDeletionBlockers,
} from "@/lib/account-deletion";

export interface DeletionState {
  blockers: DeletionBlocker[];
  requestedAt: string | null;
  purgeAt: string | null;
}

function purgeDate(requestedAt: string) {
  return new Date(
    new Date(requestedAt).getTime() + GRACE_PERIOD_DAYS * 86_400_000
  ).toISOString();
}

// Server Actions are public POST endpoints, so the caller is always re-derived
// from the session rather than passed in.
async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");
  return user;
}

// Read-only: what the confirmation screen needs to say before anyone commits.
export async function getDeletionState(): Promise<DeletionState> {
  const user = await requireUser();
  const admin = createAdminClient();

  const [blockers, { data: profile }] = await Promise.all([
    findDeletionBlockers(admin, user.id),
    admin.from("profiles").select("deletion_requested_at").eq("id", user.id).maybeSingle(),
  ]);

  const requestedAt = (profile?.deletion_requested_at as string | null) ?? null;
  return {
    blockers,
    requestedAt,
    purgeAt: requestedAt ? purgeDate(requestedAt) : null,
  };
}

export async function requestAccountDeletion(): Promise<{
  error?: string;
  blockers?: DeletionBlocker[];
  purgeAt?: string;
}> {
  const user = await requireUser();
  const admin = createAdminClient();

  // Re-checked here, not just on the screen that offered the button. The
  // blockers exist to protect other people, so they have to hold even if the
  // page was stale or the request was forged.
  const blockers = await findDeletionBlockers(admin, user.id);
  if (blockers.length > 0) return { blockers };

  const requestedAt = new Date().toISOString();
  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: requestedAt })
    .eq("id", user.id);

  if (error) {
    console.error("requestAccountDeletion failed:", error);
    return { error: "Couldn't schedule the deletion. Please try again." };
  }

  revalidatePath("/profile");
  return { purgeAt: purgeDate(requestedAt) };
}

export async function cancelAccountDeletion(): Promise<{ error?: string }> {
  const user = await requireUser();
  const admin = createAdminClient();

  const { error } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", user.id)
    .is("deleted_at", null);

  if (error) {
    console.error("cancelAccountDeletion failed:", error);
    return { error: "Couldn't cancel the deletion. Please try again." };
  }

  revalidatePath("/profile");
  return {};
}

// Called right after a successful sign-in. Coming back is the clearest possible
// statement that they didn't mean it, so the request is cancelled without
// asking - and the caller shows a notice saying so, rather than letting it
// happen silently.
export async function cancelDeletionOnSignIn(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("profiles")
    .update({ deletion_requested_at: null })
    .eq("id", userId)
    .is("deleted_at", null)
    .not("deletion_requested_at", "is", null)
    .select("id");

  return (data?.length ?? 0) > 0;
}
