"use client";

import { createContext, useContext, ReactNode } from "react";

// Whether Stripe is in test mode, decided once on the server from
// STRIPE_SECRET_KEY (sk_test…) and handed down. The secret key is the thing that
// actually processes payments, so it's the honest source of truth - reading the
// publishable key instead would let a "test" notice show on a live checkout if
// the two ever fell out of sync. Client components read it with the hook.
const StripeModeContext = createContext(false);

export function StripeModeProvider({
  testMode,
  children,
}: {
  testMode: boolean;
  children: ReactNode;
}) {
  return <StripeModeContext.Provider value={testMode}>{children}</StripeModeContext.Provider>;
}

export function useStripeTestMode(): boolean {
  return useContext(StripeModeContext);
}
