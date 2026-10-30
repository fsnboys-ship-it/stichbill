-- Task 003 increment 1: access persistence only. No public account creation or retail tables.
CREATE SCHEMA auth;
REVOKE ALL ON SCHEMA auth FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA auth REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

CREATE TABLE auth.identity_accounts (
  id uuid PRIMARY KEY, normalised_email text NOT NULL UNIQUE,
  disabled_at timestamptz,
  CHECK (normalised_email = lower(btrim(normalised_email)) AND length(normalised_email) BETWEEN 3 AND 254)
);
-- Credentials and password/reset flows are the next increment. Raw tokens are never stored.
CREATE TABLE auth.identity_sessions (
  id uuid PRIMARY KEY, identity_id uuid NOT NULL REFERENCES auth.identity_accounts(id),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL,
  revoked_at timestamptz, CHECK (expires_at > created_at), UNIQUE(id, identity_id)
);
CREATE INDEX ON auth.identity_sessions(identity_id);
CREATE TABLE public.tenants (
  id uuid PRIMARY KEY, name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  timezone text NOT NULL DEFAULT 'Asia/Kolkata', currency text NOT NULL DEFAULT 'INR' CHECK (currency='INR')
);
CREATE TABLE public.memberships (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL,
  identity_id uuid NOT NULL REFERENCES auth.identity_accounts(id),
  display_name text NOT NULL CHECK (length(btrim(display_name)) BETWEEN 1 AND 160),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,identity_id), UNIQUE(tenant_id,id,identity_id)
);
CREATE INDEX ON public.memberships(identity_id);
CREATE TABLE public.shops (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL,
  code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160),
  active boolean NOT NULL DEFAULT true, PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,code)
);
CREATE TABLE public.branches (
  tenant_id uuid NOT NULL, id uuid NOT NULL, shop_id uuid NOT NULL,
  code text NOT NULL CHECK(length(btrim(code)) BETWEEN 1 AND 40),
  name text NOT NULL CHECK(length(btrim(name)) BETWEEN 1 AND 160), active boolean NOT NULL DEFAULT true,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,shop_id,id), UNIQUE(tenant_id,shop_id,code),
  FOREIGN KEY(tenant_id,shop_id) REFERENCES public.shops(tenant_id,id)
);
CREATE TABLE public.roles (
  tenant_id uuid NOT NULL REFERENCES public.tenants(id), code text NOT NULL CHECK(code IN ('owner','cashier')),
  PRIMARY KEY(tenant_id,code)
);
CREATE TABLE public.membership_roles (
  tenant_id uuid NOT NULL, membership_id uuid NOT NULL, role_code text NOT NULL,
  PRIMARY KEY(tenant_id,membership_id,role_code),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES public.memberships(tenant_id,id),
  FOREIGN KEY(tenant_id,role_code) REFERENCES public.roles(tenant_id,code)
);
CREATE INDEX ON public.membership_roles(tenant_id,role_code);
CREATE TABLE public.membership_scopes (
  tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL,
  shop_id uuid NOT NULL, branch_id uuid, all_shop_branches boolean NOT NULL DEFAULT false,
  PRIMARY KEY(tenant_id,id),
  UNIQUE NULLS NOT DISTINCT(tenant_id,membership_id,shop_id,branch_id),
  CHECK ((all_shop_branches AND branch_id IS NULL) OR (NOT all_shop_branches AND branch_id IS NOT NULL)),
  FOREIGN KEY(tenant_id,membership_id) REFERENCES public.memberships(tenant_id,id),
  FOREIGN KEY(tenant_id,shop_id) REFERENCES public.shops(tenant_id,id),
  FOREIGN KEY(tenant_id,shop_id,branch_id) REFERENCES public.branches(tenant_id,shop_id,id)
);
CREATE INDEX ON public.membership_scopes(tenant_id,shop_id,branch_id);
CREATE TABLE public.membership_sessions (
  tenant_id uuid NOT NULL, id uuid NOT NULL, membership_id uuid NOT NULL, identity_id uuid NOT NULL,
  identity_session_id uuid NOT NULL, expires_at timestamptz NOT NULL, revoked_at timestamptz,
  PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,identity_session_id,membership_id),
  FOREIGN KEY(tenant_id,membership_id,identity_id) REFERENCES public.memberships(tenant_id,id,identity_id),
  FOREIGN KEY(identity_session_id,identity_id) REFERENCES auth.identity_sessions(id,identity_id)
);
CREATE INDEX ON public.membership_sessions(tenant_id,membership_id,identity_id);
CREATE INDEX ON public.membership_sessions(identity_session_id,identity_id);

-- Constrained identity lookup: this is the only runtime route to global session data.
-- The function owner is the non-superuser migrator, with explicit administrative RLS policies.
CREATE FUNCTION auth.resolve_context(p_hash text, p_tenant uuid)
RETURNS TABLE(membership_id uuid, identity_id uuid, is_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT m.id, m.identity_id,
    EXISTS(SELECT 1 FROM public.membership_roles r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id AND r.role_code='owner')
  FROM auth.identity_sessions s
  JOIN auth.identity_accounts a ON a.id=s.identity_id
  JOIN public.memberships m ON m.identity_id=a.id AND m.tenant_id=p_tenant
  JOIN public.tenants t ON t.id=m.tenant_id
  JOIN public.membership_sessions ms ON ms.tenant_id=m.tenant_id AND ms.membership_id=m.id AND ms.identity_session_id=s.id AND ms.identity_id=a.id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
    AND a.disabled_at IS NULL AND m.status='active' AND t.status='active'
    AND ms.revoked_at IS NULL AND ms.expires_at>statement_timestamp()
    AND EXISTS(SELECT 1 FROM public.membership_roles r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id)
$$;
CREATE FUNCTION auth.can_access(p_tenant uuid, p_shop uuid DEFAULT NULL, p_branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(p_tenant::text = nullif(current_setting('app.tenant_id',true),'') AND EXISTS (
    SELECT 1 FROM auth.resolve_context(current_setting('app.session_hash',true),p_tenant) c
    WHERE c.membership_id::text = nullif(current_setting('app.membership_id',true),'')
      AND (c.is_owner OR p_shop IS NULL OR EXISTS (
        SELECT 1 FROM public.membership_scopes scope
        WHERE scope.tenant_id=p_tenant AND scope.membership_id=c.membership_id AND scope.shop_id=p_shop
          AND (p_branch IS NULL OR scope.all_shop_branches OR scope.branch_id=p_branch)
      ))
  ), false)
$$;
CREATE FUNCTION auth.is_owner(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT auth.can_access(p_tenant) AND EXISTS (
    SELECT 1 FROM auth.resolve_context(current_setting('app.session_hash',true),p_tenant) c WHERE c.is_owner
  )
$$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA auth FROM PUBLIC;

DO $body$
DECLARE runtime_name text := current_database() || '_runtime';
        migrator_name text := current_database() || '_migrator';
        table_name text;
BEGIN
  IF current_user <> migrator_name THEN RAISE EXCEPTION 'Use the dedicated migrator'; END IF;
  EXECUTE format('GRANT USAGE ON SCHEMA auth TO %I',runtime_name);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO %I',runtime_name);
  FOREACH table_name IN ARRAY ARRAY['tenants','memberships','shops','branches','roles','membership_roles','membership_scopes','membership_sessions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',table_name);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',table_name);
    EXECUTE format('CREATE POLICY migration_access ON public.%I TO %I USING (true) WITH CHECK (true)',table_name,migrator_name);
    -- Runtime is deliberately read-only until reviewed command services exist.
    EXECUTE format('GRANT SELECT ON public.%I TO %I',table_name,runtime_name);
  END LOOP;
  EXECUTE format('CREATE POLICY runtime_read ON public.tenants FOR SELECT TO %I USING (auth.can_access(id))',runtime_name);
  EXECUTE format('CREATE POLICY runtime_read ON public.shops FOR SELECT TO %I USING (active AND auth.can_access(tenant_id,id))',runtime_name);
  EXECUTE format('CREATE POLICY runtime_read ON public.branches FOR SELECT TO %I USING (active AND auth.can_access(tenant_id,shop_id,id) AND EXISTS (SELECT 1 FROM public.shops s WHERE s.tenant_id=branches.tenant_id AND s.id=branches.shop_id AND s.active))',runtime_name);
  FOREACH table_name IN ARRAY ARRAY['memberships','membership_roles','membership_scopes','membership_sessions'] LOOP
    EXECUTE format('CREATE POLICY runtime_read ON public.%I FOR SELECT TO %I USING (auth.can_access(tenant_id) AND (auth.is_owner(tenant_id) OR %I::text = current_setting(''app.membership_id'',true)))',table_name,runtime_name,CASE WHEN table_name='memberships' THEN 'id' ELSE 'membership_id' END);
  END LOOP;
  EXECUTE format('CREATE POLICY runtime_read ON public.roles FOR SELECT TO %I USING (auth.can_access(tenant_id))',runtime_name);
END $body$;
