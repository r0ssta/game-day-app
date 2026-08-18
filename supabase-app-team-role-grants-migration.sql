-- Grant API roles usage on new role enums so PostgREST selects succeed.
-- Without USAGE, authenticated clients get opaque failures loading club users.

grant usage on type public.app_role to anon, authenticated, service_role;
grant usage on type public.team_role to anon, authenticated, service_role;

notify pgrst, 'reload schema';
