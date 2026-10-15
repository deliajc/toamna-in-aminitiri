-- Toamna în amintiri — configurare Supabase
-- Rulează tot fișierul o singură dată în Supabase → SQL Editor → New query → Run.

-- 1) Bucket PRIVAT pentru fișiere (fără acces public).
--    file_size_limit = limita maximă per fișier (aici 500 MB). Pe planul Free,
--    Supabase permite cel mult 50 MB per fișier — vezi README.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-media',
  'event-media',
  false,
  524288000,
  array[
    'image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif',
    'video/mp4','video/quicktime','video/webm','video/3gpp','video/x-m4v'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nu se creează nicio politică pentru storage.objects: vizitatorii anonimi nu pot
-- citi, lista sau șterge nimic. Încărcarea se face doar prin URL-uri semnate,
-- valabile pentru un singur fișier, emise de server după validare.

-- 2) Registrul încărcărilor (folosit de panoul admin și de limitarea abuzurilor).
create table if not exists public.media (
  id          uuid primary key default gen_random_uuid(),
  path        text not null unique,
  kind        text not null check (kind in ('image','video')),
  mime        text not null,
  size        bigint not null default 0,
  status      text not null default 'pending' check (status in ('pending','ready','rejected')),
  ip_hash     text not null,
  created_at  timestamptz not null default now()
);

create index if not exists media_status_created_idx on public.media (status, created_at desc);
create index if not exists media_ip_created_idx on public.media (ip_hash, created_at desc);

-- RLS activat fără politici = tabel inaccesibil pentru chei publice (anon).
alter table public.media enable row level security;

-- Proiectele noi Supabase nu mai dau drepturi automat pe tabelele noi.
grant select, insert, update, delete on table public.media to service_role;
