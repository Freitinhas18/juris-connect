ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "organization_memberships_self_select" ON "organization_memberships" FOR SELECT USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "organization_memberships_tenant_access" ON "organization_memberships" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "sessions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sessions_self_access" ON "sessions" USING ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid) WITH CHECK ("user_id" = NULLIF(current_setting('app.user_id', true), '')::uuid);--> statement-breakpoint
CREATE POLICY "sessions_tenant_access" ON "sessions" USING ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid) WITH CHECK ("organization_id" = NULLIF(current_setting('app.organization_id', true), '')::uuid);--> statement-breakpoint
CREATE FUNCTION resolve_juris_session(input_token_hash text)
RETURNS TABLE(session_id uuid, user_id uuid, email text, name text, organization_id uuid, role organization_role)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public
SET row_security = off
AS $$
  SELECT s.id, u.id, u.email, u.name, s.organization_id, m.role
  FROM public.sessions AS s
  JOIN public.users AS u ON u.id = s.user_id
  JOIN public.organization_memberships AS m ON m.user_id = s.user_id AND m.organization_id = s.organization_id
  WHERE s.token_hash = input_token_hash
    AND s.revoked_at IS NULL
    AND s.expires_at > pg_catalog.now()
    AND u.email_verified_at IS NOT NULL
  LIMIT 1
$$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_juris_session(text) FROM PUBLIC;
