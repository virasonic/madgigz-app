// The one legal change currently worth interrupting somebody for.
//
// Terms of Service s15 and Organiser Terms s10 both promise that material
// changes are announced "in the app or by email". This is the in-app half:
// a one-time notice pointing at whichever document moved. The email half is
// still a manual send, and for a fee change it is the stronger of the two -
// this does not replace it.
//
// NOT a consent record. Nobody's acceptance is stored, so do not lean on it as
// evidence that a particular organiser agreed to a particular version. If that
// is ever needed (a disputed commission, say), it wants a real table with a row
// per person per version, not this.
//
// To announce a change: bump `id`, set `date` and `docs`, rewrite the
// `legalUpdate.body` string in both catalogs, and pick the narrowest `audience`
// that is actually affected. A new id is what makes the notice reappear for
// everyone, including people who dismissed the previous one. Set the whole
// export to null once an announcement has run its course.
import type { LegalDocKey } from "@/lib/legal";
import type { Role } from "@/lib/types";

export interface LegalUpdate {
  /** Bumping this re-shows the notice to everyone. Also the stored value. */
  id: string;
  /** ISO date the change took effect; rendered for the reader. */
  date: string;
  /** Documents that changed - one link each, in the reader's language. */
  docs: LegalDocKey[];
  /**
   * Who is actually affected. A commission change is an organiser matter, and
   * showing it to fans invites "did my tickets get more expensive?" support
   * mail about a fee they never pay.
   */
  audience: "everyone" | "artists";
}

export const CURRENT_LEGAL_UPDATE: LegalUpdate | null = {
  id: "2026-08-21-commission-floor",
  date: "2026-08-21",
  docs: ["organiserTerms"],
  audience: "artists",
};

export function shouldSeeLegalUpdate(update: LegalUpdate | null, role: Role, isGuest: boolean) {
  if (!update || isGuest) return false;          // no account, no terms to have changed
  if (update.audience === "everyone") return true;
  return role === "artist";                       // admins are staff, not organisers
}
