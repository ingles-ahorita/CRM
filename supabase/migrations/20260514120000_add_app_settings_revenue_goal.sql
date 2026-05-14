create table if not exists public.app_settings (
  key text primary key,
  value numeric not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;

drop policy if exists "Allow public read access to app settings" on public.app_settings;
create policy "Allow public read access to app settings"
  on public.app_settings
  for select
  using (key = 'monthly_revenue_goal_usd');

grant select on public.app_settings to anon, authenticated;

insert into public.app_settings (key, value, description)
values (
  'monthly_revenue_goal_usd',
  55000,
  'Monthly revenue goal in USD used by management dashboards'
)
on conflict (key) do nothing;
