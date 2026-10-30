// What a door scanner shows after decoding a QR. One shape for both scanners
// (#218): the logged-in /profile/scan, which looks tickets up through the
// caller's own Supabase client and RLS, and the token-scoped /door/<token>,
// which goes through server actions and the service-role client. The shared
// ScannerView renders either; only how the answer is fetched differs.
//
// Deliberately narrow - it is also what a door link returns to an anonymous
// phone, so nothing about money or the buyer belongs here.
export type ScanOutcome =
  | {
      status: "valid" | "duplicate" | "cancelled";
      ticketId: string;
      /** The show the ticket is for - what the "N of M checked in" counter is scoped to. */
      eventId: string;
      quantity: number;
      /** The price tier the seat was bought at (#151); null for single-price shows. */
      tierName: string | null;
      eventTitle: string;
      eventVenue: string;
    }
  /** No ticket matches the code. */
  | { status: "invalid" }
  /** A real ticket, but for another show than this scanner is for. */
  | { status: "wrongShow" }
  /** The door link stopped working mid-session (expired or revoked). */
  | { status: "linkExpired" };
