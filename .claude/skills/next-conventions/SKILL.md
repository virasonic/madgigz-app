---
name: next-conventions
description: The MadGigz-specific Next.js 16 / React rules that break the build or the app if ignored. Use before writing or editing any React component, hook, effect, module-scope code, or Supabase realtime subscription in this repo. Covers reading the bundled Next docs first, the setState-in-effect ban, no useSyncExternalStore, never throwing on a missing env var at module scope, and the realtime setAuth requirement.
---

# Next.js 16 / React conventions that bite here

This is **not** the Next.js in your training data — it has breaking changes.
The rules below are the ones that have actually broken this app or its Vercel
build. `CLAUDE.md` and `AGENTS.md` carry the prose; this is the pre-flight
checklist.

## Read the bundled docs before writing Next code

Before using a Next API (routing, `next/*`, server/client boundaries, config),
read the relevant guide in **`node_modules/next/dist/docs/`** (resolved from the
repo, not from memory). The `AGENTS.md` block that says this is written by
`next dev` itself — commit it with your work rather than reverting it.

## Never throw on a missing env var at module scope

A `throw` at module top-level (e.g. `if (!process.env.X) throw …`) kills the
**entire Vercel build**, not just that one route. Default or guard instead:

```ts
const FEE = Number(process.env.NEXT_PUBLIC_MADGIGZ_FEE_PERCENT ?? 5);
// or
if (!url) return null;
```

## No `useSyncExternalStore`

It broke the app here. Use `useState` + `useEffect` for external/subscription
state instead.

## Don't call `setState` synchronously inside an effect body

The Next 16 lint rule `react-hooks/set-state-in-effect` **errors** (not warns) on
a bare `setState(...)` in an effect body. Two ways out:

- **Prop-driven reset** → use React's *adjust-state-during-render* pattern, not
  an effect: keep the last-seen prop in state and reset during render when it
  changes. See `useLiveUnreadCount` / `useLiveEventStats` in `src/lib/realtime.ts`.
- **Genuinely one-time mount work that can't run during render** (reading
  `localStorage`, which has no value on the server and would hydrate a different
  tree) → do it in a mount effect and disable the rule *narrowly* with a reason:
  `// eslint-disable-next-line react-hooks/set-state-in-effect -- <why>` for one
  line, or a `/* eslint-disable … */` … `/* eslint-enable … */` block when a mount
  effect legitimately sets many fields (see `add-show/page.tsx`'s draft restore).
  A callback (a `.then()`, an event handler, a subscription handler) is **not** an
  effect body — `setState` there is fine and unflagged.

## Supabase realtime needs an authenticated socket for RLS-scoped tables

The `@supabase/ssr` browser client keeps the session in cookies and does **not**
reliably push it to the realtime websocket before you subscribe. For a channel on
an RLS-scoped table (e.g. `notifications`, scoped to the recipient) you get
nothing back unless you authenticate the socket first:

```ts
const { data } = await supabase.auth.getSession();
if (data.session) await supabase.realtime.setAuth(data.session.access_token);
// …then .channel(...).on("postgres_changes", …).subscribe()
```

`src/lib/realtime.ts` is the reference.

## Always finish with

`npm run lint` **and** `npm run build` clean before shipping — several of the
above are build/lint errors, not runtime surprises, so they're caught here.
