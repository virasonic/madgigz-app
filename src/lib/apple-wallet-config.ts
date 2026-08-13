// The Apple Wallet env check, kept separate from apple-wallet.ts so a server page
// can ask "is Wallet on?" (to show/hide the button) without importing the heavy
// passkit-generator signing library. Pure env reads, no other imports.
const env = (name: string) => process.env[name]?.trim() ?? "";

export interface AppleWalletConfig {
  passTypeIdentifier: string;
  teamIdentifier: string;
  signerCert: string;
  signerKey: string;
  wwdr: string;
  signerKeyPassphrase?: string;
}

// All PEM strings (Vercel supports multi-line values), set by Vir after creating
// the Pass Type ID + certificate in Apple Developer. Returns null when any
// required piece is missing → the feature stays off and no button shows.
export function appleWalletConfig(): AppleWalletConfig | null {
  const passTypeIdentifier = env("APPLE_PASS_TYPE_ID");
  const teamIdentifier = env("APPLE_TEAM_ID");
  const signerCert = env("APPLE_PASS_CERT");
  const signerKey = env("APPLE_PASS_KEY");
  const wwdr = env("APPLE_WWDR_CERT");
  if (!passTypeIdentifier || !teamIdentifier || !signerCert || !signerKey || !wwdr) return null;
  return {
    passTypeIdentifier,
    teamIdentifier,
    signerCert,
    signerKey,
    wwdr,
    signerKeyPassphrase: env("APPLE_PASS_KEY_PASSPHRASE") || undefined,
  };
}

export function isAppleWalletConfigured(): boolean {
  return appleWalletConfig() !== null;
}
