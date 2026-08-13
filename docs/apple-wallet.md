# Apple Wallet tickets (#129) — setup

The code is shipped and **gated**: with the env vars below unset, nothing changes
(no "Add to Apple Wallet" button). Once they're set on Vercel and you redeploy,
the button appears on the ticket QR screen. The pass's QR encodes the **ticket
UUID** — the exact value the door scanner already reads — so scanning is unchanged.

You need an **Apple Developer account** (you have one). ~20 minutes, one-time.

## 1. Register a Pass Type ID

Apple Developer → **Certificates, Identifiers & Profiles** → **Identifiers** →
**+** → **Pass Type IDs** → Register.

- Identifier: **`pass.es.aurasonic.madgigz`**
- Description: `MadGigz Ticket`

## 2. Create the Pass Type ID certificate

1. In **Keychain Access** (Mac) → menu **Certificate Assistant → Request a
   Certificate From a Certificate Authority**. Enter your email, leave "CA Email"
   blank, choose **Saved to disk**. This makes a `CertificateSigningRequest.certSigningRequest`.
2. Back in Apple Developer, open the Pass Type ID you just made → **Create
   Certificate** → upload the CSR → **Download** the `.cer`.
3. Double-click the `.cer` to add it to Keychain. In Keychain, find it, expand it,
   select **both** the certificate **and** its private key, right-click →
   **Export 2 items** → save as `MadGigzPass.p12` (set a password, or leave blank).

## 3. Get the WWDR intermediate certificate

Download **Worldwide Developer Relations — G4** from
<https://www.apple.com/certificateauthority/> (`AppleWWDRCAG4.cer`).

## 4. Convert everything to PEM

Run these in **Terminal**, in the folder with the files (replace the `.p12`
password after `pass:` if you set one; if blank, use `pass:`).

**The `-legacy` flag is required** — Keychain exports the `.p12` with an old
cipher (RC2-40-CBC) that OpenSSL 3+ rejects; without `-legacy` the two commands
below silently produce **empty** files.

```bash
# Signing certificate (PEM)
openssl pkcs12 -legacy -in MadGigzPass.p12 -clcerts -nokeys -out signerCert.pem -passin pass:
# Private key (PEM, unencrypted)
openssl pkcs12 -legacy -in MadGigzPass.p12 -nocerts -nodes -out signerKey.pem -passin pass:
# WWDR intermediate (PEM)
openssl x509 -inform DER -in AppleWWDRCAG4.cer -out wwdr.pem
```

Optional but tidy — strip Keychain's "Bag Attributes" preamble so the PEMs are
clean blocks (some parsers dislike the preamble):

```bash
openssl x509 -in signerCert.pem -out signerCert.pem
openssl pkey  -in signerKey.pem  -out signerKey.pem
```

Your **Team ID** is inside the certificate — no need to hunt for it:

```bash
openssl x509 -in signerCert.pem -noout -subject   # the OU=... value is your Team ID
```

## 5. Set the env vars on Vercel (Production + Preview) and redeploy

Project → Settings → Environment Variables. Paste each **whole PEM file** (with
the `-----BEGIN/END-----` lines — the Vercel box accepts multi-line):

| Name | Value |
|---|---|
| `APPLE_PASS_TYPE_ID` | `pass.es.aurasonic.madgigz` |
| `APPLE_TEAM_ID` | your Team ID (Apple Developer → Membership) |
| `APPLE_PASS_CERT` | contents of `signerCert.pem` |
| `APPLE_PASS_KEY` | contents of `signerKey.pem` |
| `APPLE_WWDR_CERT` | contents of `wwdr.pem` |
| `APPLE_PASS_KEY_PASSPHRASE` | only if you left the key encrypted — usually omit |

Then **Redeploy** (env changes need a rebuild). Locally, the same lines go in
`.env.local` wrapped in double quotes so the newlines survive.

## 6. Test

Open a ticket (a paid, non-refunded one) → **Add to Apple Wallet** → the pass
should add to Wallet with the event, venue, date, and a scannable QR. Scan it at
the door screen (`/profile/scan`) — it reads the same UUID as the in-app QR.

## Notes / follow-ups

- **Google Wallet** is the separate half — needs a Google Wallet API **issuer
  account** (distinct from the Play developer account). Do it once that's approved.
- **Pass updates / push** (auto-updating a pass when a show is moved or cancelled)
  needs a pass web service + APNs — not built; passes are static for now.
- The signing cert **expires ~1 year**; regenerate it (steps 2, 4, 5) before then,
  like the Apple Sign-in secret (#125).
