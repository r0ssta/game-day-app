#!/usr/bin/env node
/**
 * Transactional RLS checks for club tenancy. Always rolls back.
 *
 * Usage:
 *   node scripts/verify-club-tenancy.mjs
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env')
  if (!fs.existsSync(envPath)) return

  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const index = trimmed.indexOf('=')
    if (index <= 0) continue
    const key = trimmed.slice(0, index).trim()
    let value = trimmed.slice(index + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    if (process.env[key] === undefined) {
      process.env[key] = value
    }
  }
}

function getDatabaseUrl() {
  return process.env.SUPABASE_DB_URL || process.env.DATABASE_URL || null
}

function buildPoolerFallbackUrls(databaseUrl) {
  let parsed
  try {
    parsed = new URL(databaseUrl)
  } catch {
    return []
  }

  const hostMatch = parsed.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/i)
  if (!hostMatch) return []

  const projectRef = hostMatch[1]
  const password = decodeURIComponent(parsed.password || '')
  const database = parsed.pathname.replace(/^\//, '') || 'postgres'
  const preferred = process.env.SUPABASE_POOLER_REGION || 'us-east-1'
  const regions = [preferred, 'us-east-1', 'us-east-2'].filter(
    (region, index, all) => all.indexOf(region) === index,
  )

  return regions.flatMap((region) => {
    const session = new URL(`postgresql://aws-0-${region}.pooler.supabase.com:5432/${database}`)
    session.username = `postgres.${projectRef}`
    session.password = password
    if (parsed.search) session.search = parsed.search
    return [session.toString()]
  })
}

async function connectWithFallback(databaseUrl) {
  const urls = [databaseUrl, ...buildPoolerFallbackUrls(databaseUrl)]
  let lastError = null
  for (const candidate of urls) {
    const client = new pg.Client({
      connectionString: candidate,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10_000,
    })
    try {
      await client.connect()
      return client
    } catch (error) {
      lastError = error
      try {
        await client.end()
      } catch {
        // ignore
      }
    }
  }
  throw lastError ?? new Error('Unable to connect to Postgres')
}

const SQL = `
do $$
declare
  v_vv uuid;
  v_sandbox uuid;
  v_vv_user uuid := gen_random_uuid();
  v_sandbox_user uuid := gen_random_uuid();
  v_pending_user uuid := gen_random_uuid();
  v_platform_user uuid := gen_random_uuid();
  v_vv_team uuid;
  v_sandbox_team uuid;
  v_vv_player uuid;
  v_sandbox_player uuid;
  v_vv_season uuid;
  v_sandbox_season uuid;
  v_vv_match uuid;
  v_sandbox_match uuid;
  v_pending_role public.app_role;
  v_created_club public.clubs;
  v_count int;
begin
  if to_regclass('public.clubs') is null then
    raise exception 'public.clubs is missing — run db:migrate first';
  end if;

  select id into v_vv from public.clubs where lower(slug) = 'virginia-velocity' limit 1;
  if v_vv is null then
    insert into public.clubs (name, slug)
    values ('Virginia Velocity', 'virginia-velocity')
    returning id into v_vv;
  end if;

  insert into public.clubs (name, slug)
  values ('Tenancy Probe FC', 'tenancy-probe-fc-' || substr(v_sandbox_user::text, 1, 8))
  returning id into v_sandbox;

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values
    (
      '00000000-0000-0000-0000-000000000000',
      v_vv_user,
      'authenticated',
      'authenticated',
      'vv-tenancy-probe@example.invalid',
      crypt('probe', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_sandbox_user,
      'authenticated',
      'authenticated',
      'sandbox-tenancy-probe@example.invalid',
      crypt('probe', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    ),
    (
      '00000000-0000-0000-0000-000000000000',
      v_platform_user,
      'authenticated',
      'authenticated',
      'platform-tenancy-probe@example.invalid',
      crypt('probe', gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{}'::jsonb,
      now(),
      now()
    )
  on conflict (id) do nothing;

  insert into public.profiles (id, email, display_name)
  values
    (v_vv_user, 'vv-tenancy-probe@example.invalid', 'VV Probe'),
    (v_sandbox_user, 'sandbox-tenancy-probe@example.invalid', 'Sandbox Probe')
  on conflict (id) do nothing;

  insert into public.club_memberships (user_id, club_id, app_role)
  values
    (v_vv_user, v_vv, 'director'),
    (v_sandbox_user, v_sandbox, 'director')
  on conflict (user_id, club_id) do update
    set app_role = excluded.app_role;

  insert into public.user_roles (user_id, app_role, display_name)
  values
    (v_vv_user, 'director', 'VV Probe'),
    (v_sandbox_user, 'director', 'Sandbox Probe')
  on conflict (user_id) do update
    set app_role = excluded.app_role;

  insert into public.teams (name, slug, club_id, format, age_group, active_status)
  values
    ('Tenancy VV Team', 'tenancy-vv-team-' || substr(v_vv_user::text, 1, 8), v_vv, '11v11', 'U13', true),
    ('Tenancy Sandbox Team', 'tenancy-sandbox-team-' || substr(v_sandbox_user::text, 1, 8), v_sandbox, '11v11', 'U13', true)
  returning id into v_vv_team;

  select id into v_vv_team from public.teams where club_id = v_vv and name = 'Tenancy VV Team';
  select id into v_sandbox_team from public.teams where club_id = v_sandbox and name = 'Tenancy Sandbox Team';

  insert into public.seasons (name, status, club_id)
  values ('Tenancy Sandbox Season ' || substr(v_sandbox_user::text, 1, 8), 'active', v_sandbox);

  select id into v_vv_season from public.seasons where club_id = v_vv and status = 'active' limit 1;
  if v_vv_season is null then
    raise exception 'Virginia Velocity has no active season for match writes';
  end if;
  select id into v_sandbox_season
  from public.seasons
  where club_id = v_sandbox
    and name = 'Tenancy Sandbox Season ' || substr(v_sandbox_user::text, 1, 8);

  insert into public.players (first_name, last_name, age_group, club_id, jersey, position)
  values
    ('VV', 'ProbePlayer', 'U13', v_vv, 99, 'SUB'),
    ('Sandbox', 'ProbePlayer', 'U13', v_sandbox, 99, 'SUB');

  select id into v_vv_player from public.players where club_id = v_vv and last_name = 'ProbePlayer' limit 1;
  select id into v_sandbox_player from public.players where club_id = v_sandbox and last_name = 'ProbePlayer' limit 1;

  insert into public.matches (team_id, season_id, opponent, is_test)
  values
    (v_vv_team, v_vv_season, 'Tenancy VV Opponent', true),
    (v_sandbox_team, v_sandbox_season, 'Tenancy Sandbox Opponent', true);

  select id into v_vv_match from public.matches where team_id = v_vv_team and opponent = 'Tenancy VV Opponent';
  select id into v_sandbox_match from public.matches where team_id = v_sandbox_team and opponent = 'Tenancy Sandbox Opponent';

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_pending_user,
    'authenticated',
    'authenticated',
    'pending-tenancy-probe@example.invalid',
    crypt('probe', gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  )
  on conflict (id) do nothing;

  select ur.app_role into v_pending_role
  from public.user_roles ur
  where ur.user_id = v_pending_user;
  if v_pending_role is distinct from 'pending' then
    raise exception 'uninvited signup did not stay pending (got %)', v_pending_role;
  end if;

  select count(*) into v_count from public.club_memberships where user_id = v_pending_user;
  if v_count <> 0 then
    raise exception 'uninvited signup received a club membership';
  end if;

  insert into public.platform_admins (user_id)
  values (v_platform_user)
  on conflict (user_id) do nothing;

  perform set_config('request.jwt.claim.sub', v_sandbox_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_sandbox_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.teams where id = v_vv_team;
  if v_count <> 0 then
    raise exception 'sandbox director can see Velocity team';
  end if;

  select count(*) into v_count from public.teams where id = v_sandbox_team;
  if v_count <> 1 then
    raise exception 'sandbox director cannot see own team';
  end if;

  select count(*) into v_count from public.players where id = v_vv_player;
  if v_count <> 0 then
    raise exception 'sandbox director can see Velocity player';
  end if;

  select count(*) into v_count from public.seasons where id = v_vv_season;
  if v_count <> 0 then
    raise exception 'sandbox director can see Velocity season';
  end if;

  select count(*) into v_count from public.matches where id = v_vv_match;
  if v_count <> 0 then
    raise exception 'sandbox director can see Velocity match';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_vv_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_vv_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.teams where id = v_sandbox_team;
  if v_count <> 0 then
    raise exception 'velocity director can see sandbox team';
  end if;

  select count(*) into v_count from public.players where id = v_sandbox_player;
  if v_count <> 0 then
    raise exception 'velocity director can see sandbox player';
  end if;

  select count(*) into v_count from public.seasons where id = v_sandbox_season;
  if v_count <> 0 then
    raise exception 'velocity director can see sandbox season';
  end if;

  select count(*) into v_count from public.matches where id = v_sandbox_match;
  if v_count <> 0 then
    raise exception 'velocity director can see sandbox match';
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claim.sub', v_platform_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', v_platform_user::text, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';

  select count(*) into v_count from public.matches where id = v_sandbox_match;
  if v_count <> 0 then
    raise exception 'platform admin can see sandbox match without membership';
  end if;

  select count(*) into v_count from public.teams where id = v_sandbox_team;
  if v_count <> 0 then
    raise exception 'platform admin can see sandbox team without membership';
  end if;

  v_created_club := public.create_club('Tenancy Created Club', 'tenancy-created-club-' || substr(v_platform_user::text, 1, 8));
  if v_created_club.id is null then
    raise exception 'platform admin could not create a club';
  end if;

  execute 'reset role';
  raise notice 'club tenancy RLS probe passed';
end $$;
`

async function main() {
  loadEnvFile()
  const databaseUrl = getDatabaseUrl()
  if (!databaseUrl) {
    console.error('SUPABASE_DB_URL or DATABASE_URL is required')
    process.exit(1)
  }

  const client = await connectWithFallback(databaseUrl)
  try {
    await client.query('begin')
    await client.query(SQL)
    await client.query('rollback')
    console.log('Club tenancy RLS probe passed (transaction rolled back).')
  } catch (error) {
    try {
      await client.query('rollback')
    } catch {
      // ignore
    }
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  } finally {
    await client.end()
  }
}

await main()
