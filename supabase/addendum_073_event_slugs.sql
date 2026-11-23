-- Addendum 073: a URL slug per show, for pretty share links (#236).
--
-- Share links were https://<host>/e/<uuid>. The new shape is
--   https://madgigz.app/event/2026/11/28/weyvir-sala-x
-- The date part comes from event_date at request time; only the slug is stored.
-- It is generated ONCE, at insert, from the title - and then never changes, so
-- a link that has been pasted into WhatsApp keeps working even if the organiser
-- later corrects the title. If the DATE changes, the page redirects from the old
-- date to the new one (the app resolves by slug alone and compares the date).
--
-- Classification: PUBLIC. events keeps a table-level select grant (addendum_026
-- only narrowed insert/update), so no column grant is needed. Deliberately NOT
-- in the insert grant either: the browser never sends a slug, the trigger
-- assigns it, and a client-chosen slug would be a vanity/squatting surface.
--
-- SAFE ON A LIVE DB - purely additive. The app ships first and falls back to
-- /e/<id> links while the column is missing; run this on staging, then prod.
-- Re-runnable.

-- ============ 1. The slugifier ============

-- Lower-case, strip the accents Spanish titles actually carry, collapse every
-- other run of characters to a single hyphen, cap at 60 chars. Deterministic and
-- dependency-free on purpose (no unaccent extension to enable per project).
create or replace function public.slugify(input text)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      trim(both '-' from
        left(
          trim(both '-' from
            regexp_replace(
              translate(
                lower(coalesce(input, '')),
                'áàâäãåéèêëíìîïóòôöõúùûüñçýÿ',
                'aaaaaaeeeeiiiiooooouuuuncyy'
              ),
              '[^a-z0-9]+', '-', 'g'
            )
          ),
          60
        )
      ),
      ''
    ),
    'show'
  )
$$;

revoke execute on function public.slugify(text) from public, anon, authenticated;

-- ============ 2. The column ============

alter table public.events
  add column if not exists slug text;

comment on column public.events.slug is
  'URL slug for /event/yyyy/mm/dd/<slug> share links (#236). Set once by events_set_slug at insert, from the title; never rewritten. Unique.';

create unique index if not exists events_slug_key on public.events (slug) where slug is not null;

-- ============ 3. Assign it at insert ============

-- BEFORE INSERT only. A duplicate title (the same act at the same venue twice,
-- or a residency) gets -2, -3, ... appended; the unique index is the backstop if
-- two inserts race. Fires alphabetically after events_apply_schedule (071) and
-- touches nothing but slug.
create or replace function public.set_event_slug()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  base text;
  candidate text;
  n integer := 2;
begin
  if new.slug is not null and new.slug <> '' then
    return new;
  end if;
  base := public.slugify(new.title);
  candidate := base;
  while exists (select 1 from public.events where slug = candidate and id <> new.id) loop
    candidate := base || '-' || n;
    n := n + 1;
  end loop;
  new.slug := candidate;
  return new;
end;
$$;

revoke execute on function public.set_event_slug() from public, anon, authenticated;

drop trigger if exists events_set_slug on public.events;
create trigger events_set_slug
  before insert on public.events
  for each row
  execute function public.set_event_slug();

-- ============ 4. Backfill every existing show ============

-- Oldest first, so the un-suffixed slug goes to the show that was created
-- first - the one most likely to have links already in circulation... none of
-- which carry a slug yet, so this is purely about tidiness. Row by row because
-- each assignment must see the ones before it.
do $$
declare
  r record;
  base text;
  candidate text;
  n integer;
begin
  for r in select id, title from public.events where slug is null order by created_at, id loop
    base := public.slugify(r.title);
    candidate := base;
    n := 2;
    while exists (select 1 from public.events where slug = candidate and id <> r.id) loop
      candidate := base || '-' || n;
      n := n + 1;
    end loop;
    update public.events set slug = candidate where id = r.id;
  end loop;
end
$$;
