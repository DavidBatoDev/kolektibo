-- 0006 — Production application foundation (additive, approval-gated)
-- ---------------------------------------------------------------------------
-- Adds the directory structures used by the production sitemap and six-step
-- pool wizard. Money authority remains exclusively in Soroban. These tables
-- describe policy, roles, files, and read models; none can transfer funds.
--
-- IMPORTANT: authoring this migration does not apply it. Follow supabase/README
-- and obtain explicit approval before `supabase db push`.

-- ============================ profile + consent ============================

alter table public.profiles
  add column if not exists timezone text not null default 'Asia/Manila',
  add column if not exists date_format text not null default 'MMM d, yyyy',
  add column if not exists accessibility_prefs jsonb not null default '{}'::jsonb;

grant update (timezone, date_format, accessibility_prefs)
  on table public.profiles to authenticated;

create table public.user_consents (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles(id) on delete cascade,
  kind       text not null check (kind in ('terms','privacy','age_18','marketing')),
  version    text not null,
  granted    boolean not null,
  source     text not null default 'web' check (source in ('web','oauth','admin_import')),
  created_at timestamptz not null default now(),
  unique (user_id, kind, version)
);
create index user_consents_user_idx on public.user_consents(user_id, created_at desc);
alter table public.user_consents enable row level security;
create policy "own consent read" on public.user_consents for select to authenticated
  using (user_id = (select auth.uid()));
create policy "own consent insert" on public.user_consents for insert to authenticated
  with check (user_id = (select auth.uid()));
grant select, insert on table public.user_consents to authenticated;
grant usage, select on sequence public.user_consents_id_seq to authenticated;

-- ======================== pool directory + lifecycle =======================

alter table public.pools
  add column if not exists template text not null default 'general'
    check (template in ('general','dues','project','event','relief','custom')),
  add column if not exists default_language text not null default 'en'
    check (default_language in ('en','tl')),
  add column if not exists timezone text not null default 'Asia/Manila',
  add column if not exists display_currency text not null default 'PHP'
    check (display_currency in ('PHP','USD','USDC')),
  add column if not exists visibility text not null default 'private'
    check (visibility = 'private'),
  add column if not exists deployed_at timestamptz,
  add column if not exists archived_at timestamptz;

alter table public.pools drop constraint if exists pools_status_check;
alter table public.pools add constraint pools_status_check check (
  status in (
    'draft','collecting_signers','ready','deploying','active','paused',
    'migration_required','migrated','archived'
  )
);

-- Operational roles are independent from on-chain signer membership. Keep
-- `officer` during the v1 transition; new UI may use owner/treasurer/auditor.
alter table public.pool_members drop constraint if exists pool_members_role_check;
alter table public.pool_members add constraint pool_members_role_check
  check (role in ('owner','officer','treasurer','member','auditor'));

alter table public.pool_invites drop constraint if exists pool_invites_role_check;
alter table public.pool_invites add constraint pool_invites_role_check
  check (role in ('owner','officer','treasurer','member','auditor'));

create table public.pool_signers (
  id             uuid primary key default gen_random_uuid(),
  pool_id        uuid not null references public.pools(id) on delete cascade,
  user_id        uuid not null references public.profiles(id) on delete cascade,
  wallet_id      uuid references public.user_wallets(id) on delete set null,
  stellar_address text,
  status         text not null default 'invited'
    check (status in ('invited','ready','active','removed')),
  recovery_ready boolean not null default false,
  added_at       timestamptz not null default now(),
  removed_at     timestamptz,
  unique (pool_id, user_id)
);
create index pool_signers_pool_idx on public.pool_signers(pool_id, status);
alter table public.pool_signers enable row level security;
create policy "member reads signers" on public.pool_signers for select to authenticated
  using (public.is_pool_member(pool_id));
create policy "officer manages draft signers" on public.pool_signers for all to authenticated
  using (
    public.is_pool_officer(pool_id)
    and exists (
      select 1 from public.pools p
      where p.id = pool_id and p.status in ('draft','collecting_signers','ready')
    )
  )
  with check (
    public.is_pool_officer(pool_id)
    and exists (
      select 1 from public.pools p
      where p.id = pool_id and p.status in ('draft','collecting_signers','ready')
    )
  );
grant select, insert, update, delete on table public.pool_signers to authenticated;

-- `is_pool_officer` remains the compatibility directory-permission helper. An
-- on-chain signer does not gain operational permissions merely by approving.
create or replace function public.is_pool_officer(p_pool uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.pool_members m
    where m.pool_id = p_pool
      and m.user_id = (select auth.uid())
      and m.role in ('owner','officer')
  );
$$;

-- Existing migrations defined RLS correctly but did not establish a complete
-- PostgREST privilege baseline on a freshly reset project. Grants permit the
-- operation to reach RLS; the policies above and in 0001 still decide which
-- rows are visible or writable. Backend-only tables intentionally stay absent.
grant select on table public.profiles to authenticated;
grant select, insert, update, delete on table public.user_settings to authenticated;
grant select, delete on table public.user_wallets to authenticated;
grant select, insert, update, delete on table public.push_subscriptions to authenticated;
grant select on table public.pools to authenticated;
grant update (name, description, policy, rules_text, template, default_language, timezone, display_currency)
  on table public.pools to authenticated;
grant select on table public.pool_members to authenticated;
grant select, insert, update, delete on table public.pool_invites to authenticated;
grant select on table public.invite_redemptions to authenticated;
grant select, insert, update, delete on table public.payees to authenticated;
grant select on table public.chain_events to authenticated;
grant select, insert, update, delete on table public.spend_meta to authenticated;
grant select, insert on table public.contribution_meta to authenticated;
grant select, insert, update, delete on table public.paluwagan_cycles to authenticated;
grant select on table public.cycle_contributions to authenticated;
grant select on table public.ai_usage to authenticated;
grant select, update, delete on table public.notifications to authenticated;
grant select on table public.feature_flags to authenticated;

-- =========================== normalized policy ============================

create table public.pool_contribution_policies (
  pool_id               uuid primary key references public.pools(id) on delete cascade,
  mode                  text not null default 'voluntary'
    check (mode in ('voluntary','suggested','required','goal')),
  amount                numeric check (amount is null or amount > 0),
  frequency             text check (frequency in ('once','weekly','monthly','quarterly','custom')),
  starts_on             date,
  due_day               int check (due_day is null or due_day between 1 and 28),
  ends_on               date,
  grace_days            int not null default 0 check (grace_days between 0 and 30),
  reminder_rules        jsonb not null default '[]'::jsonb,
  target_amount         numeric check (target_amount is null or target_amount > 0),
  member_totals_visible boolean not null default true,
  updated_at            timestamptz not null default now()
);
create trigger set_updated_at before update on public.pool_contribution_policies
  for each row execute function public.tg_set_updated_at();

create table public.pool_categories (
  id                    uuid primary key default gen_random_uuid(),
  pool_id               uuid not null references public.pools(id) on delete cascade,
  name                  text not null,
  description           text,
  per_transaction_cap   numeric check (per_transaction_cap is null or per_transaction_cap > 0),
  rolling_monthly_cap   numeric check (rolling_monthly_cap is null or rolling_monthly_cap > 0),
  attachment_required   boolean not null default false,
  sort_order            int not null default 0,
  unique (pool_id, name)
);
create index pool_categories_pool_idx on public.pool_categories(pool_id, sort_order);

create table public.pool_approval_tiers (
  id                 uuid primary key default gen_random_uuid(),
  pool_id            uuid not null references public.pools(id) on delete cascade,
  minimum_amount     numeric not null check (minimum_amount >= 0),
  required_approvals int not null check (required_approvals > 0),
  unique (pool_id, minimum_amount)
);
create index pool_approval_tiers_pool_idx on public.pool_approval_tiers(pool_id, minimum_amount);

create table public.pool_goals (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid not null references public.pools(id) on delete cascade,
  name        text not null,
  description text,
  target_amount numeric not null check (target_amount > 0),
  starts_on   date,
  ends_on     date,
  status      text not null default 'active' check (status in ('draft','active','completed','cancelled')),
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create trigger set_updated_at before update on public.pool_goals
  for each row execute function public.tg_set_updated_at();
create index pool_goals_pool_idx on public.pool_goals(pool_id, status);

alter table public.pool_contribution_policies enable row level security;
alter table public.pool_categories enable row level security;
alter table public.pool_approval_tiers enable row level security;
alter table public.pool_goals enable row level security;

create policy "member reads contribution policy" on public.pool_contribution_policies for select to authenticated using (public.is_pool_member(pool_id));
create policy "officer writes contribution policy" on public.pool_contribution_policies for all to authenticated using (public.is_pool_officer(pool_id)) with check (public.is_pool_officer(pool_id));
create policy "member reads categories" on public.pool_categories for select to authenticated using (public.is_pool_member(pool_id));
create policy "officer writes categories" on public.pool_categories for all to authenticated using (public.is_pool_officer(pool_id)) with check (public.is_pool_officer(pool_id));
create policy "member reads approval tiers" on public.pool_approval_tiers for select to authenticated using (public.is_pool_member(pool_id));
create policy "officer writes approval tiers" on public.pool_approval_tiers for all to authenticated using (public.is_pool_officer(pool_id)) with check (public.is_pool_officer(pool_id));
create policy "member reads goals" on public.pool_goals for select to authenticated using (public.is_pool_member(pool_id));
create policy "officer writes goals" on public.pool_goals for all to authenticated using (public.is_pool_officer(pool_id)) with check (public.is_pool_officer(pool_id));

grant select, insert, update, delete on table public.pool_contribution_policies to authenticated;
grant select, insert, update, delete on table public.pool_categories to authenticated;
grant select, insert, update, delete on table public.pool_approval_tiers to authenticated;
grant select, insert, update, delete on table public.pool_goals to authenticated;

-- ========================== transaction metadata ==========================

alter table public.payees
  add column if not exists payee_type text not null default 'organization'
    check (payee_type in ('individual','organization')),
  add column if not exists contact_name text,
  add column if not exists email text,
  add column if not exists phone text,
  add column if not exists tags text[] not null default '{}';

alter table public.spend_meta
  add column if not exists purpose text,
  add column if not exists description text,
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists external_reference text,
  add column if not exists needed_by date,
  add column if not exists expires_at timestamptz,
  add column if not exists urgency text not null default 'normal'
    check (urgency in ('normal','urgent')),
  add column if not exists decision_status text not null default 'pending'
    check (decision_status in ('pending','rejected','cancelled')),
  add column if not exists decision_reason text;

alter table public.contribution_meta
  add column if not exists contribution_type text not null default 'general'
    check (contribution_type in ('general','dues','goal')),
  add column if not exists goal_id uuid references public.pool_goals(id) on delete set null;

create table public.pool_attachments (
  id          uuid primary key default gen_random_uuid(),
  pool_id     uuid not null references public.pools(id) on delete cascade,
  spend_id    int,
  goal_id     uuid references public.pool_goals(id) on delete cascade,
  uploaded_by uuid references public.profiles(id) on delete set null,
  storage_path text not null unique,
  file_name   text not null,
  mime_type   text not null,
  size_bytes  bigint not null check (size_bytes > 0 and size_bytes <= 10485760),
  created_at  timestamptz not null default now(),
  check (spend_id is not null or goal_id is not null)
);
create index pool_attachments_pool_idx on public.pool_attachments(pool_id, created_at desc);
alter table public.pool_attachments enable row level security;
create policy "member reads attachments" on public.pool_attachments for select to authenticated using (public.is_pool_member(pool_id));
create policy "member inserts attachments" on public.pool_attachments for insert to authenticated
  with check (public.is_pool_member(pool_id) and uploaded_by = (select auth.uid()));
create policy "uploader or officer deletes attachments" on public.pool_attachments for delete to authenticated
  using (uploaded_by = (select auth.uid()) or public.is_pool_officer(pool_id));
grant select, insert, delete on table public.pool_attachments to authenticated;

-- Private pool-scoped files. Object paths must begin with the pool UUID:
-- receipts/<pool-id>/<generated-name>. Metadata remains in pool_attachments.
insert into storage.buckets (id, name, public, file_size_limit)
values ('receipts', 'receipts', false, 10485760)
on conflict (id) do update set public = false, file_size_limit = 10485760;

drop policy if exists "pool members read receipts" on storage.objects;
create policy "pool members read receipts" on storage.objects for select to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.pools p
      where p.id::text = (storage.foldername(name))[1]
        and public.is_pool_member(p.id)
    )
  );

drop policy if exists "pool members upload receipts" on storage.objects;
create policy "pool members upload receipts" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'receipts'
    and owner_id = (select auth.uid())::text
    and exists (
      select 1 from public.pools p
      where p.id::text = (storage.foldername(name))[1]
        and public.is_pool_member(p.id)
    )
  );

drop policy if exists "receipt owner or officer deletes" on storage.objects;
create policy "receipt owner or officer deletes" on storage.objects for delete to authenticated
  using (
    bucket_id = 'receipts'
    and exists (
      select 1 from public.pools p
      where p.id::text = (storage.foldername(name))[1]
        and (
          owner_id = (select auth.uid())::text
          or public.is_pool_officer(p.id)
        )
    )
  );

-- ============================= smart wallets ===============================

alter table public.user_wallets drop constraint if exists user_wallets_kind_check;
alter table public.user_wallets add constraint user_wallets_kind_check
  check (kind in ('passkey','passkey_smart','external','legacy_local'));
alter table public.user_wallets
  add column if not exists smart_account_address text,
  add column if not exists recovery_ready boolean not null default false,
  add column if not exists credential_count int not null default 0 check (credential_count >= 0),
  add column if not exists last_verified_at timestamptz;

-- verified_at/recovery fields remain backend-controlled. Preserve the 0005
-- column lock while allowing users to edit harmless labels/primary selection.
revoke update on table public.user_wallets from anon, authenticated;
grant update (label, is_primary) on table public.user_wallets to authenticated;

-- =================== draft creation + normalized extraction ===============

create or replace function public.create_pool_draft(
  p_name        text,
  p_description text  default null,
  p_kind        text  default 'treasury',
  p_policy      jsonb default null,
  p_rules_text  text  default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_pool uuid;
  v_prod jsonb := coalesce(p_policy -> 'production', '{}'::jsonb);
  v_contrib jsonb := coalesce(v_prod -> 'contribution', '{}'::jsonb);
  v_spending jsonb := coalesce(v_prod -> 'spending', '{}'::jsonb);
  v_gov jsonb := coalesce(v_prod -> 'governance', '{}'::jsonb);
  v_item jsonb;
  v_order int := 0;
  v_target_approvers int := coalesce(nullif(v_gov ->> 'targetApprovers', '')::int, 2);
  v_default_threshold int := coalesce(nullif(v_gov ->> 'defaultThreshold', '')::int, 1);
  v_last_tier numeric := -1;
begin
  if v_uid is null then raise exception 'auth required'; end if;
  if char_length(trim(coalesce(p_name, ''))) not between 3 and 80 then
    raise exception 'name must be 3 to 80 characters';
  end if;
  if char_length(coalesce(p_description, '')) > 500 then
    raise exception 'description too long';
  end if;
  if jsonb_typeof(coalesce(v_spending -> 'categories', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_spending -> 'categories', '[]'::jsonb)) = 0 then
    raise exception 'at least one spending category is required';
  end if;
  if jsonb_typeof(coalesce(v_gov -> 'approvalTiers', '[]'::jsonb)) <> 'array'
     or jsonb_array_length(coalesce(v_gov -> 'approvalTiers', '[]'::jsonb)) = 0 then
    raise exception 'at least one approval tier is required';
  end if;
  if v_target_approvers < 2 or v_target_approvers > 10 then
    raise exception 'approver count must be between 2 and 10';
  end if;
  if v_default_threshold < 1 or v_default_threshold > v_target_approvers then
    raise exception 'default threshold exceeds approver count';
  end if;
  if coalesce(nullif(v_spending ->> 'expirationDays', '')::int, 7) not between 1 and 90 then
    raise exception 'request expiration must be between 1 and 90 days';
  end if;
  if nullif(v_contrib ->> 'endDate', '') is not null
     and nullif(v_contrib ->> 'startDate', '') is not null
     and (v_contrib ->> 'endDate')::date < (v_contrib ->> 'startDate')::date then
    raise exception 'contribution end date precedes start date';
  end if;

  insert into public.pools (
    contract_id, name, description, kind, policy, rules_text, created_by, status,
    template, default_language, timezone, display_currency, visibility
  ) values (
    null, trim(p_name), nullif(trim(coalesce(p_description, '')), ''), p_kind,
    p_policy, p_rules_text, v_uid, 'draft',
    coalesce(nullif(v_prod ->> 'template', ''), 'general'),
    coalesce(nullif(v_prod ->> 'language', ''), 'en'),
    coalesce(nullif(v_prod ->> 'timezone', ''), 'Asia/Manila'),
    coalesce(nullif(v_prod ->> 'displayCurrency', ''), 'PHP'),
    'private'
  ) returning id into v_pool;

  -- Keep the legacy officer role until the pool_signers cutover is complete.
  insert into public.pool_members (pool_id, user_id, role)
  values (v_pool, v_uid, 'officer');

  insert into public.pool_signers (pool_id, user_id, status)
  values (v_pool, v_uid, case when coalesce((v_gov ->> 'creatorIsApprover')::boolean, true) then 'invited' else 'removed' end);

  insert into public.pool_contribution_policies (
    pool_id, mode, amount, frequency, starts_on, due_day, ends_on, grace_days,
    reminder_rules, target_amount, member_totals_visible
  ) values (
    v_pool,
    coalesce(nullif(v_contrib ->> 'mode', ''), 'voluntary'),
    nullif(v_contrib ->> 'amount', '')::numeric,
    nullif(v_contrib ->> 'frequency', ''),
    nullif(v_contrib ->> 'startDate', '')::date,
    nullif(v_contrib ->> 'dueDay', '')::int,
    nullif(v_contrib ->> 'endDate', '')::date,
    coalesce(nullif(v_contrib ->> 'graceDays', '')::int, 0),
    coalesce(v_contrib -> 'reminders', '[]'::jsonb),
    nullif(v_contrib ->> 'targetAmount', '')::numeric,
    coalesce((v_contrib ->> 'memberTotalsVisible')::boolean, true)
  );

  for v_item in select value from jsonb_array_elements(coalesce(v_spending -> 'categories', '[]'::jsonb)) loop
    if char_length(trim(coalesce(v_item ->> 'name', ''))) = 0 then
      raise exception 'category name is required';
    end if;
    insert into public.pool_categories (
      pool_id, name, description, per_transaction_cap, rolling_monthly_cap,
      attachment_required, sort_order
    ) values (
      v_pool, trim(v_item ->> 'name'), nullif(trim(coalesce(v_item ->> 'description','')), ''),
      nullif(v_item ->> 'perSpendCap', '')::numeric,
      nullif(v_item ->> 'monthlyCap', '')::numeric,
      coalesce((v_item ->> 'attachmentRequired')::boolean, false), v_order
    );
    v_order := v_order + 1;
  end loop;

  for v_item in select value from jsonb_array_elements(coalesce(v_gov -> 'approvalTiers', '[]'::jsonb)) loop
    if (v_item ->> 'minimumAmount')::numeric <= v_last_tier then
      raise exception 'approval tiers must be strictly ordered';
    end if;
    if (v_item ->> 'requiredApprovals')::int < 1
       or (v_item ->> 'requiredApprovals')::int > v_target_approvers then
      raise exception 'approval tier exceeds approver count';
    end if;
    insert into public.pool_approval_tiers (pool_id, minimum_amount, required_approvals)
    values (v_pool, (v_item ->> 'minimumAmount')::numeric, (v_item ->> 'requiredApprovals')::int);
    v_last_tier := (v_item ->> 'minimumAmount')::numeric;
  end loop;

  if nullif(v_contrib ->> 'targetAmount', '') is not null then
    insert into public.pool_goals (pool_id, name, description, target_amount, starts_on, ends_on, created_by)
    values (
      v_pool, trim(p_name) || ' target', 'Primary target created with the pool',
      (v_contrib ->> 'targetAmount')::numeric,
      nullif(v_contrib ->> 'startDate', '')::date,
      nullif(v_contrib ->> 'endDate', '')::date,
      v_uid
    );
  end if;

  return v_pool;
end;
$$;
revoke execute on function public.create_pool_draft(text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_pool_draft(text, text, text, jsonb, text) to authenticated, service_role;

-- OAuth identities have already verified ownership of their provider email.
-- Password accounts continue through Kolektibo's six-digit verification flow.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_provider text := coalesce(new.raw_app_meta_data ->> 'provider', 'email');
begin
  insert into public.profiles (id, display_name, is_email_verified)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), 'New member'),
    v_provider <> 'email'
  ) on conflict (id) do nothing;
  insert into public.user_settings (user_id) values (new.id) on conflict (user_id) do nothing;

  if new.raw_user_meta_data ->> 'terms_accepted_at' is not null then
    insert into public.user_consents (user_id, kind, version, granted, source)
    values
      (new.id, 'terms', 'beta-2026-07-14', true, case when v_provider = 'email' then 'web' else 'oauth' end),
      (new.id, 'privacy', 'beta-2026-07-14', true, case when v_provider = 'email' then 'web' else 'oauth' end),
      (new.id, 'age_18', 'beta-2026-07-14', true, case when v_provider = 'email' then 'web' else 'oauth' end),
      (new.id, 'marketing', 'beta-2026-07-14', coalesce((new.raw_user_meta_data ->> 'marketing_consent')::boolean, false), case when v_provider = 'email' then 'web' else 'oauth' end)
    on conflict (user_id, kind, version) do nothing;
  end if;
  return new;
end;
$$;

create or replace function public.sync_user_consents_from_auth()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.raw_user_meta_data ->> 'terms_accepted_at' is not null then
    insert into public.user_consents (user_id, kind, version, granted, source)
    values
      (new.id, 'terms', 'beta-2026-07-14', true, 'oauth'),
      (new.id, 'privacy', 'beta-2026-07-14', true, 'oauth'),
      (new.id, 'age_18', 'beta-2026-07-14', true, 'oauth')
    on conflict (user_id, kind, version) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_consent_updated on auth.users;
create trigger on_auth_user_consent_updated
after update of raw_user_meta_data on auth.users
for each row execute function public.sync_user_consents_from_auth();

update public.profiles p set is_email_verified = true
where exists (
  select 1 from auth.identities i
  where i.user_id = p.id and i.provider <> 'email'
);

-- Feature gates remain off until migration/RLS/E2E verification is complete.
insert into public.feature_flags (key, enabled, payload) values
  ('production_shell', false, '{"stage":"internal"}'::jsonb),
  ('pool_wizard_v1', false, '{"stage":"internal"}'::jsonb),
  ('passkey_wallets', false, '{"stage":"planned"}'::jsonb),
  ('contract_v2', false, '{"stage":"planned"}'::jsonb)
on conflict (key) do nothing;
