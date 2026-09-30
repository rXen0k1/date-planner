-- Auvia: 프리셋·계획표 클라우드 동기화 (Supabase SQL Editor에서 실행)
-- 무료 플랜으로 충분합니다. 테이블이 없으면 앱은 localStorage만 사용합니다.

create table if not exists public.user_presets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('default', 'custom')),
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, name, kind)
);

alter table public.user_presets enable row level security;

drop policy if exists "presets_own" on public.user_presets;
create policy "presets_own" on public.user_presets
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.saved_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  title text not null default '',
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, client_id)
);

-- 기존 테이블이 이미 있다면(클라이언트에서 재실행 시) 유니크 인덱스만 보강
create unique index if not exists saved_plans_user_client_uidx
  on public.saved_plans (user_id, client_id);

create index if not exists saved_plans_user_created_idx
  on public.saved_plans (user_id, created_at desc);

alter table public.saved_plans enable row level security;

drop policy if exists "plans_own" on public.saved_plans;
create policy "plans_own" on public.saved_plans
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
