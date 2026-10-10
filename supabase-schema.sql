-- 작년, 오늘: 사용자별 기록장 저장 테이블
-- Supabase 대시보드 > SQL Editor에서 전체를 붙여넣고 Run 하세요.
create table if not exists public.user_journals (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  image text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.user_journals enable row level security;

drop policy if exists "Users can view their own journals" on public.user_journals;
create policy "Users can view their own journals"
  on public.user_journals for select
  to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own journals" on public.user_journals;
create policy "Users can insert their own journals"
  on public.user_journals for insert
  to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own journals" on public.user_journals;
create policy "Users can update their own journals"
  on public.user_journals for update
  to authenticated using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create index if not exists user_journals_user_updated_idx
  on public.user_journals (user_id, updated_at desc);
