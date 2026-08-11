-- addendum_034: a storage-usage figure for the admin dashboard (#100).
--
-- We're on Supabase Pro now (~100GB storage), so the point isn't to avoid a
-- bill - it's to *see* the number climb before it ever matters, and to sanity-
-- check that #96's client-side downscaling is actually keeping uploads small.
--
-- The size lives in `storage.objects` (each row carries `metadata->>'size'` in
-- bytes), but that table is in the `storage` schema, which PostgREST doesn't
-- expose - so the admin client can't just select from it. This function is the
-- bridge: a security-definer aggregate in `public`, callable over RPC, that
-- rolls the objects up per bucket. It reads only sizes and counts, never file
-- contents or paths.
--
-- Locked to service_role (the admin panel's client). Execute is revoked from
-- anon/authenticated so no logged-in user can call it - it would otherwise leak
-- the platform's total file footprint to anyone with the anon key.
--
-- Pure create-or-replace + grant, no revoke of anything in use: safe to run
-- directly on a live database.

create or replace function public.admin_storage_usage()
returns table (bucket_id text, bytes bigint, files bigint)
language sql
security definer
set search_path = public
as $$
  select
    o.bucket_id,
    -- Older objects can predate the size metadata; sum() skips the nulls and
    -- coalesce keeps a bucket of only-such-objects at 0 rather than null.
    coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint as bytes,
    count(*)::bigint as files
  from storage.objects o
  group by o.bucket_id
  order by bytes desc;
$$;

revoke all on function public.admin_storage_usage() from public, anon, authenticated;
grant execute on function public.admin_storage_usage() to service_role;
