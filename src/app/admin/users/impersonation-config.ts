// Whether the admin "act as any user" tool is on. A plain module (not
// "use server"), because a server-action file may only export async functions,
// yet the admin user page needs this boolean to decide whether to show the
// button. Server-only env var, so it never reaches the browser.
//
// UNSET in production = feature off. Set ALLOW_ADMIN_IMPERSONATION=true in the
// environment to enable it for a testing phase; unset it before go-live.
export const IMPERSONATION_ENABLED = process.env.ALLOW_ADMIN_IMPERSONATION === "true";
