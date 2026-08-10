"use server";

import { createClient } from "@/lib/supabase/server";
import { sendFeedbackAlert } from "@/lib/email";

export type FeedbackType = "bug" | "support" | "idea";

const TYPES: FeedbackType[] = ["bug", "support", "idea"];
const MAX_LENGTH = 4000;

// A server action rather than a client insert, for two reasons: the role and
// the email are read here from the session instead of being taken on trust,
// and the support alert needs a key that has no business in the browser.
export async function submitFeedback(input: {
  type: string;
  message: string;
  route: string | null;
}): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to send feedback" };

  const message = input.message.trim();
  if (!message) return { error: "Write a message first" };
  if (message.length > MAX_LENGTH) return { error: "That's a bit long - try trimming it down" };

  const type = (TYPES as string[]).includes(input.type) ? (input.type as FeedbackType) : "idea";

  // Their role now is their role at submission - a fan who becomes an artist
  // later shouldn't turn this into an artist's report retrospectively.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role, username")
    .eq("id", user.id)
    .single();

  const { error } = await supabase.from("feedback").insert({
    user_id: user.id,
    type,
    message,
    // Only ever a same-origin path, and only used for display in the admin
    // panel - but it arrives from the client, so it is length-capped rather
    // than trusted wholesale.
    route: input.route?.slice(0, 200) ?? null,
    role_at_submission: profile?.role ?? null,
    contact_email: user.email ?? null,
  });

  if (error) {
    console.error("submitFeedback failed:", error);
    return { error: "Couldn't send that just now. Please try again." };
  }

  await sendFeedbackAlert({
    type,
    message,
    from: `${profile?.username ?? "someone"} <${user.email ?? "no email"}>`,
    route: input.route ?? null,
  });

  return { error: null };
}
