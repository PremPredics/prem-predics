-- Prem Predics: additive, idempotent Web Push setup. No league/game data is changed.
-- Deploy supabase/functions/gameweek-notifications before enabling the cron job.
-- All devices start opted OUT. Never run a season reset for this feature.
begin;
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema if not exists pp_notifications;
revoke all on schema pp_notifications from public, anon, authenticated;

create table if not exists pp_notifications.config (
  singleton boolean primary key default true check(singleton),
  enabled_at timestamptz not null default now(),
  public_key text,
  baseline_ready boolean not null default false
);
insert into pp_notifications.config(singleton) values(true) on conflict do nothing;
alter table pp_notifications.config enable row level security;

do $$
begin
  if not exists(select 1 from vault.secrets where name='pp_push_cron_secret') then
    perform vault.create_secret(gen_random_uuid()::text || gen_random_uuid()::text,'pp_push_cron_secret');
  end if;
end $$;

create table if not exists public.pp_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique check(length(endpoint) between 20 and 2048),
  p256dh text not null,
  auth text not null,
  gameweek_ended boolean not null default false,
  deadline_reminder boolean not null default false,
  ended_enabled_at timestamptz,
  deadline_enabled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists pp_push_subscriptions_user_idx on public.pp_push_subscriptions(user_id);
alter table public.pp_push_subscriptions enable row level security;
revoke all on public.pp_push_subscriptions from public, anon, authenticated;
grant select, delete on public.pp_push_subscriptions to authenticated;
grant all on public.pp_push_subscriptions to service_role;
drop policy if exists pp_push_own_read on public.pp_push_subscriptions;
create policy pp_push_own_read on public.pp_push_subscriptions for select to authenticated using ((select auth.uid())=user_id);
drop policy if exists pp_push_own_delete on public.pp_push_subscriptions;
create policy pp_push_own_delete on public.pp_push_subscriptions for delete to authenticated using ((select auth.uid())=user_id);

-- Only the authenticated owner is derived from the JWT; never accept a caller's user_id.
-- The endpoint is a browser-held capability. Rebinding it prevents previous accounts on
-- a shared browser from continuing to receive notifications on that same subscription.
create or replace function public.pp_push_subscribe(p_endpoint text,p_p256dh text,p_auth text,p_ended boolean,p_deadline boolean)
returns void language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'Sign in first'; end if;
  if p_endpoint !~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-zA-Z0-9-]+[.]notify[.]windows[.]com)/'
    or length(p_endpoint)>2048 or p_p256dh !~ '^[A-Za-z0-9_-]{87}=?$' or p_auth !~ '^[A-Za-z0-9_-]{22}={0,2}$'
    or p_ended is null or p_deadline is null then raise exception 'Invalid push subscription'; end if;
  perform pg_advisory_xact_lock(hashtext(p_endpoint));
  if (select count(*) from public.pp_push_subscriptions where user_id=uid and endpoint<>p_endpoint)>=10 then
    raise exception 'Maximum of 10 notification devices reached';
  end if;
  insert into public.pp_push_subscriptions(user_id,endpoint,p256dh,auth,gameweek_ended,deadline_reminder,ended_enabled_at,deadline_enabled_at)
  values(uid,p_endpoint,p_p256dh,p_auth,p_ended,p_deadline,case when p_ended then now() end,case when p_deadline then now() end)
  on conflict(endpoint) do update set
    user_id=uid,p256dh=excluded.p256dh,auth=excluded.auth,updated_at=now(),
    gameweek_ended=p_ended,deadline_reminder=p_deadline,
    ended_enabled_at=case when p_ended then case when pp_push_subscriptions.user_id=uid and pp_push_subscriptions.gameweek_ended then pp_push_subscriptions.ended_enabled_at else now() end end,
    deadline_enabled_at=case when p_deadline then case when pp_push_subscriptions.user_id=uid and pp_push_subscriptions.deadline_reminder then pp_push_subscriptions.deadline_enabled_at else now() end end;
end $$;
revoke all on function public.pp_push_subscribe(text,text,text,boolean,boolean) from public,anon;
grant execute on function public.pp_push_subscribe(text,text,text,boolean,boolean) to authenticated;

create table if not exists pp_notifications.events (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null,
  gameweek_id bigint not null,
  gameweek_number integer not null,
  kind text not null check(kind in ('ended','deadline')),
  occurred_at timestamptz not null,
  expires_at timestamptz not null,
  body text not null,
  unique(gameweek_id,kind)
);
create table if not exists pp_notifications.deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references pp_notifications.events(id) on delete cascade,
  subscription_id uuid not null references public.pp_push_subscriptions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check(status in ('pending','sending','sent','failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sent_at timestamptz,
  last_status integer,
  unique(event_id,subscription_id)
);
create index if not exists pp_push_delivery_pending on pp_notifications.deliveries(next_attempt_at) where status in ('pending','sending');
create index if not exists pp_push_delivery_subscription on pp_notifications.deliveries(subscription_id);
alter table pp_notifications.events enable row level security;
alter table pp_notifications.deliveries enable row level security;

-- Record already-completed weeks as expired once, so later score corrections
-- cannot announce an old GW as newly finished. Re-running preserves live events.
do $$
begin
  if not (select baseline_ready from pp_notifications.config where singleton) then
    insert into pp_notifications.events(season_id,gameweek_id,gameweek_number,kind,occurred_at,expires_at,body)
    select g.season_id,g.id,g.number,'ended',max(f.updated_at),'epoch'::timestamptz,'Pre-launch baseline'
    from public.gameweeks g join public.fixtures f on f.gameweek_id=g.id and f.status<>'postponed'
    group by g.season_id,g.id,g.number having bool_and(f.status='final')
    on conflict(gameweek_id,kind) do nothing;
    update pp_notifications.config set baseline_ready=true where singleton;
  end if;
end $$;

-- This public RPC exposes ONLY the VAPID public key.
create or replace function public.pp_push_public_key() returns text
language sql security definer set search_path='' as $$
 select public_key from pp_notifications.config where singleton;
$$;
revoke all on function public.pp_push_public_key() from public;
grant execute on function public.pp_push_public_key() to anon,authenticated,service_role;

-- Internal service-role RPCs. Neither anonymous nor signed-in users can call these.
create or replace function public.pp_push_runtime() returns jsonb
language sql security definer set search_path='' as $$
 select jsonb_build_object('publicKey',c.public_key,
 'privateKey',(select decrypted_secret from vault.decrypted_secrets where name='pp_push_vapid_private'),
 'cronSecret',(select decrypted_secret from vault.decrypted_secrets where name='pp_push_cron_secret'))
 from pp_notifications.config c where singleton;
$$;
create or replace function public.pp_push_initialize(p_public text,p_private text) returns void
language plpgsql security definer set search_path='' as $$
begin
  perform 1 from pp_notifications.config where singleton for update;
  if (select public_key from pp_notifications.config where singleton) is null then
    perform vault.create_secret(p_private,'pp_push_vapid_private');
    update pp_notifications.config set public_key=p_public where singleton;
  end if;
end $$;

-- Collect one event per season GW, independent of how many leagues a user belongs to.
create or replace function pp_notifications.collect_events() returns void
language plpgsql security definer set search_path='' as $$
begin
  insert into pp_notifications.events(season_id,gameweek_id,gameweek_number,kind,occurred_at,expires_at,body)
  select g.season_id,g.id,g.number,'ended',max(f.updated_at),max(f.updated_at)+interval '24 hours',
    format('Gameweek %s has ended! Check out results and do your Prem Predics for next week!',g.number)
  from public.gameweeks g join public.seasons s on s.id=g.season_id and s.is_active
  join public.fixtures f on f.gameweek_id=g.id and f.status<>'postponed'
  group by g.season_id,g.id,g.number
  having bool_and(f.status='final') and max(f.updated_at)>=(select enabled_at from pp_notifications.config where singleton)
    and max(f.updated_at)>now()-interval '24 hours'
  on conflict(gameweek_id,kind) do nothing;

  insert into pp_notifications.events(season_id,gameweek_id,gameweek_number,kind,occurred_at,expires_at,body)
  select d.season_id,d.gameweek_id,d.gameweek_number,'deadline',
    least(d.star_man_locks_at,d.first_fixture_kickoff_at-interval '90 minutes')-interval '2 hours',
    least(d.star_man_locks_at,d.first_fixture_kickoff_at-interval '90 minutes')-interval '105 minutes',
    format('Gameweek %s deadlines will lock in 2 hours, make sure you''ve submitted everything!',d.gameweek_number)
  from public.gameweek_deadlines d join public.seasons s on s.id=d.season_id and s.is_active
  where now()>=least(d.star_man_locks_at,d.first_fixture_kickoff_at-interval '90 minutes')-interval '2 hours'
    and now()<least(d.star_man_locks_at,d.first_fixture_kickoff_at-interval '90 minutes')-interval '105 minutes'
  on conflict(gameweek_id,kind) do nothing;

  insert into pp_notifications.deliveries(event_id,subscription_id,user_id)
  select e.id,p.id,p.user_id from pp_notifications.events e cross join public.pp_push_subscriptions p
  where e.expires_at>now() and (
    (e.kind='ended' and p.gameweek_ended and p.ended_enabled_at<=e.occurred_at) or
    (e.kind='deadline' and p.deadline_reminder and p.deadline_enabled_at<=e.occurred_at))
  and exists(select 1 from public.competition_members m join public.competitions c on c.id=m.competition_id
    join public.gameweeks start_gw on start_gw.id=c.starts_gameweek_id
    where m.user_id=p.user_id and c.season_id=e.season_id and start_gw.number<=e.gameweek_number and m.joined_at<=e.occurred_at)
  on conflict(event_id,subscription_id) do nothing;
end $$;

create or replace function public.pp_push_claim() returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
  with picked as (
    select d.id from pp_notifications.deliveries d
    join pp_notifications.events e on e.id=d.event_id
    join public.pp_push_subscriptions p on p.id=d.subscription_id and p.user_id=d.user_id
    where d.status in ('pending','sending') and d.next_attempt_at<=now() and d.attempts<5 and e.expires_at>now()
    and ((e.kind='ended' and p.gameweek_ended and p.ended_enabled_at<=e.occurred_at)
      or (e.kind='deadline' and p.deadline_reminder and p.deadline_enabled_at<=e.occurred_at))
    and exists(select 1 from public.competition_members m join public.competitions c on c.id=m.competition_id
      join public.gameweeks start_gw on start_gw.id=c.starts_gameweek_id
      where m.user_id=p.user_id and c.season_id=e.season_id and start_gw.number<=e.gameweek_number)
    order by d.next_attempt_at limit 30 for update of d skip locked
  ), claimed as (
    update pp_notifications.deliveries d set status='sending',attempts=attempts+1,next_attempt_at=now()+interval '5 minutes'
    from picked where d.id=picked.id returning d.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',d.id,'subscriptionId',p.id,'endpoint',p.endpoint,
    'keys',jsonb_build_object('p256dh',p.p256dh,'auth',p.auth),
    'expiresAt',e.expires_at,'payload',jsonb_build_object('title','Prem Predics','body',e.body,'tag',e.id,'url','/index.html'))),'[]'::jsonb)
  into result from claimed d join pp_notifications.events e on e.id=d.event_id
  join public.pp_push_subscriptions p on p.id=d.subscription_id;
  return result;
end $$;

create or replace function public.pp_push_finish(p_id uuid,p_status integer) returns void
language plpgsql security definer set search_path='' as $$
begin
  update pp_notifications.deliveries set
    status=case when p_status between 200 and 299 then 'sent' when p_status in (400,404,410) or attempts>=5 then 'failed' else 'pending' end,
    sent_at=case when p_status between 200 and 299 then now() end,last_status=p_status,
    next_attempt_at=now()+interval '2 minutes'*greatest(attempts,1)
    where id=p_id;
  if p_status in (404,410) then
    update public.pp_push_subscriptions set gameweek_ended=false,deadline_reminder=false
    where id=(select subscription_id from pp_notifications.deliveries where id=p_id);
  end if;
end $$;

revoke all on function public.pp_push_runtime() from public,anon,authenticated;
revoke all on function public.pp_push_initialize(text,text) from public,anon,authenticated;
revoke all on function public.pp_push_claim() from public,anon,authenticated;
revoke all on function public.pp_push_finish(uuid,integer) from public,anon,authenticated;
grant execute on function public.pp_push_runtime(),public.pp_push_initialize(text,text),public.pp_push_claim(),public.pp_push_finish(uuid,integer) to service_role;
revoke all on all functions in schema pp_notifications from public,anon,authenticated;

create or replace function pp_notifications.tick() returns void
language plpgsql security definer set search_path='' as $$
begin
  perform pp_notifications.collect_events();
  if (select public_key from pp_notifications.config where singleton) is null or exists(
    select 1 from pp_notifications.deliveries d join pp_notifications.events e on e.id=d.event_id
    where d.status in ('pending','sending') and d.attempts<5 and d.next_attempt_at<=now() and e.expires_at>now()
  ) then
    perform net.http_post(
      url:='https://bduiyeddwlgxzpzbelqf.supabase.co/functions/v1/gameweek-notifications',
      headers:=jsonb_build_object('Content-Type','application/json','X-Prem-Push-Secret',
        (select decrypted_secret from vault.decrypted_secrets where name='pp_push_cron_secret')),
      body:='{}'::jsonb,timeout_milliseconds:=55000);
  end if;
end $$;
revoke all on function pp_notifications.tick() from public,anon,authenticated;
select cron.schedule('prem-predics-gameweek-push','* * * * *','select pp_notifications.tick();');
commit;

-- Read-only checks (do NOT display Vault secrets):
-- select public.pp_push_public_key() is not null as signing_key_ready;
-- select jobname,active from cron.job where jobname='prem-predics-gameweek-push';
-- select status,count(*) from pp_notifications.deliveries group by status;
-- select id,kind,gameweek_number,occurred_at from pp_notifications.events order by occurred_at desc;
