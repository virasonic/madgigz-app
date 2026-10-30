// The door counter: how many people are in, out of how many are expected.
// Shared by both scanners (the logged-in one reads tickets through RLS, the
// door link through a token-scoped server action) so "a person" is counted
// the same way in both: by ticket quantity, not by ticket row, and refunded
// tickets are nobody - they are refused at the door and don't belong in the
// total either.
export interface AdmissionCount {
  /** People already checked in. */
  checkedIn: number;
  /** People expected: every live (unrefunded) ticket, by quantity. */
  total: number;
}

export interface AdmissionRow {
  quantity: number;
  checked_in_at: string | null;
  refunded: boolean;
}

export function countAdmissions(rows: AdmissionRow[]): AdmissionCount {
  let checkedIn = 0;
  let total = 0;
  for (const row of rows) {
    if (row.refunded) continue;
    total += row.quantity;
    if (row.checked_in_at) checkedIn += row.quantity;
  }
  return { checkedIn, total };
}
