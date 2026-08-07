import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  DiscountRow,
  EventRow,
  mapDiscount,
  mapEvent,
  TicketRow,
} from "@/lib/types";

// Verifies the current session belongs to an admin. Every admin page/action
// calls this first - throws (caught by Next's error boundary) rather than
// silently returning partial data if the check fails.
export async function requireAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin") throw new Error("Not authorized");
  return user;
}

export interface AdminUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  createdAt: string;
  lastSignInAt: string | null;
  ticketCount: number;
}

export async function fetchAllUsers(admin: SupabaseClient): Promise<AdminUserRow[]> {
  const { data: authData } = await admin.auth.admin.listUsers();
  const { data: profileRows } = await admin
    .from("profiles")
    .select("id, username, role, created_at");
  const { data: ticketRows } = await admin.from("tickets").select("user_id");

  const ticketCounts = new Map<string, number>();
  (ticketRows ?? []).forEach((row: { user_id: string }) => {
    ticketCounts.set(row.user_id, (ticketCounts.get(row.user_id) ?? 0) + 1);
  });

  const profileById = new Map((profileRows ?? []).map((p) => [p.id, p]));

  return (authData?.users ?? []).map((u) => {
    const profile = profileById.get(u.id);
    return {
      id: u.id,
      email: u.email ?? "",
      username: profile?.username ?? "-",
      role: profile?.role ?? "fan",
      createdAt: u.created_at,
      lastSignInAt: u.last_sign_in_at ?? null,
      ticketCount: ticketCounts.get(u.id) ?? 0,
    };
  });
}

export async function fetchDashboardStats(admin: SupabaseClient) {
  const [{ count: userCount }, { count: eventCount }, { data: tickets }] = await Promise.all([
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("events").select("*", { count: "exact", head: true }),
    admin.from("tickets").select("quantity, price_paid, purchased_at"),
  ]);

  const ticketsSold = (tickets ?? []).reduce((sum, t) => sum + t.quantity, 0);
  const revenue = (tickets ?? []).reduce((sum, t) => sum + Number(t.price_paid), 0);

  const { data: profileDates } = await admin.from("profiles").select("created_at");
  const signupsByDay = new Map<string, number>();
  (profileDates ?? []).forEach((p) => {
    const day = new Date(p.created_at).toISOString().slice(0, 10);
    signupsByDay.set(day, (signupsByDay.get(day) ?? 0) + 1);
  });

  return {
    userCount: userCount ?? 0,
    eventCount: eventCount ?? 0,
    ticketsSold,
    revenue,
    signupsByDay: Array.from(signupsByDay.entries()).sort(([a], [b]) => a.localeCompare(b)),
  };
}

export async function fetchAllEventsAdmin(admin: SupabaseClient) {
  const { data } = await admin.from("events").select("*").order("event_date");
  return ((data as EventRow[]) ?? []).map(mapEvent);
}

export interface AdminTicketRow {
  id: string;
  username: string;
  eventTitle: string;
  quantity: number;
  pricePaid: number;
  purchasedAt: string;
}

export async function fetchAllTicketsAdmin(admin: SupabaseClient): Promise<AdminTicketRow[]> {
  const { data: tickets } = await admin
    .from("tickets")
    .select("*")
    .order("purchased_at", { ascending: false });
  const { data: profiles } = await admin.from("profiles").select("id, username");
  const { data: events } = await admin.from("events").select("id, title");

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username]));
  const titleById = new Map((events ?? []).map((e) => [e.id, e.title]));

  return ((tickets as TicketRow[]) ?? []).map((t) => ({
    id: t.id,
    username: usernameById.get(t.user_id) ?? "-",
    eventTitle: titleById.get(t.event_id) ?? "-",
    quantity: t.quantity,
    pricePaid: Number(t.price_paid),
    purchasedAt: t.purchased_at,
  }));
}

export async function fetchAllDiscounts(admin: SupabaseClient) {
  const { data } = await admin.from("discounts").select("*").order("created_at", { ascending: false });
  return ((data as DiscountRow[]) ?? []).map(mapDiscount);
}

export function adminClient() {
  return createAdminClient();
}
