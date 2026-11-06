-- Increment 2. No runtime table writes or changes to tenant policies.
ALTER TABLE stich_auth.identity_accounts ADD COLUMN password_hash text;
CREATE TABLE stich_auth.password_resets (
  token_hash text PRIMARY KEY CHECK(token_hash ~ '^[a-f0-9]{64}$'),
  identity_id uuid NOT NULL REFERENCES stich_auth.identity_accounts(id),
  expires_at timestamptz NOT NULL, used_at timestamptz
);
CREATE TABLE stich_auth.attempt_buckets (
  key_hash text PRIMARY KEY CHECK(key_hash ~ '^[a-f0-9]{64}$'),
  started_at timestamptz NOT NULL, attempts integer NOT NULL CHECK(attempts > 0)
);

CREATE FUNCTION stich_auth.throttle(p_key text, p_limit integer)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE hits integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 100 OR p_key !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO stich_auth.attempt_buckets VALUES(p_key,statement_timestamp(),1)
  ON CONFLICT(key_hash) DO UPDATE SET
    started_at=CASE WHEN stich_auth.attempt_buckets.started_at < statement_timestamp()-interval '15 minutes' THEN statement_timestamp() ELSE stich_auth.attempt_buckets.started_at END,
    attempts=CASE WHEN stich_auth.attempt_buckets.started_at < statement_timestamp()-interval '15 minutes' THEN 1 ELSE least(stich_auth.attempt_buckets.attempts+1,101) END
  RETURNING attempts INTO hits;
  RETURN hits <= p_limit;
END $$;

CREATE FUNCTION stich_auth.credentials(p_email text)
RETURNS TABLE(password_hash text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT a.password_hash FROM stich_auth.identity_accounts a WHERE a.normalised_email=p_email AND a.disabled_at IS NULL
$$;

-- The credential hash comparison prevents login/reset races from issuing a session for an old password.
CREATE FUNCTION stich_auth.login(p_email text,p_verified_hash text,p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; session_id uuid := gen_random_uuid(); expiry timestamptz := statement_timestamp()+interval '8 hours';
BEGIN
  SELECT id INTO account FROM stich_auth.identity_accounts WHERE normalised_email=p_email AND password_hash=p_verified_hash AND disabled_at IS NULL FOR UPDATE;
  IF account IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO stich_auth.identity_sessions(id,identity_id,token_hash,expires_at) VALUES(session_id,account,p_token,expiry);
  INSERT INTO public.membership_sessions(tenant_id,id,membership_id,identity_id,identity_session_id,expires_at)
    SELECT m.tenant_id,gen_random_uuid(),m.id,account,session_id,expiry FROM public.memberships m JOIN public.tenants t ON t.id=m.tenant_id
    WHERE m.identity_id=account AND m.status='active' AND t.status='active';
  RETURN true;
END $$;

CREATE FUNCTION stich_auth.register_owner(p_email text,p_password text,p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid := gen_random_uuid();
BEGIN
  IF p_password !~ '^argon2id:65536:3:1:[a-f0-9]{32}:[a-f0-9]{64}$' OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO stich_auth.identity_accounts(id,normalised_email,password_hash) VALUES(account,p_email,p_password) ON CONFLICT(normalised_email) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO stich_auth.identity_sessions(id,identity_id,token_hash,expires_at) VALUES(gen_random_uuid(),account,p_token,statement_timestamp()+interval '8 hours');
  RETURN true;
END $$;

CREATE FUNCTION stich_auth.session_info(p_token text)
RETURNS TABLE(identity_id uuid,tenant_id uuid, business_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT a.id,t.id,t.name FROM stich_auth.identity_sessions s JOIN stich_auth.identity_accounts a ON a.id=s.identity_id
  LEFT JOIN public.membership_sessions ms ON ms.identity_session_id=s.id AND ms.identity_id=a.id AND ms.revoked_at IS NULL AND ms.expires_at>statement_timestamp()
  LEFT JOIN public.memberships m ON m.tenant_id=ms.tenant_id AND m.id=ms.membership_id AND m.identity_id=a.id AND m.status='active'
  LEFT JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
  WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp() AND a.disabled_at IS NULL
$$;

CREATE FUNCTION stich_auth.onboard(p_token text,p_business text,p_owner text)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid; session_id uuid; expiry timestamptz; tenant uuid := gen_random_uuid(); member uuid := gen_random_uuid();
BEGIN
  SELECT a.id,s.id,s.expires_at INTO account,session_id,expiry FROM stich_auth.identity_sessions s JOIN stich_auth.identity_accounts a ON a.id=s.identity_id
    WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp() AND a.disabled_at IS NULL FOR UPDATE OF a;
  IF account IS NULL THEN RETURN NULL; END IF;
  -- Account row lock serialises concurrent onboarding across every session for this owner.
  IF EXISTS(SELECT 1 FROM public.memberships WHERE identity_id=account) THEN RETURN NULL; END IF;
  INSERT INTO public.tenants(id,name) VALUES(tenant,btrim(p_business));
  INSERT INTO public.memberships(tenant_id,id,identity_id,display_name) VALUES(tenant,member,account,btrim(p_owner));
  INSERT INTO public.roles VALUES(tenant,'owner'),(tenant,'cashier');
  INSERT INTO public.membership_roles VALUES(tenant,member,'owner');
  INSERT INTO public.membership_sessions(tenant_id,id,membership_id,identity_id,identity_session_id,expires_at)
    VALUES(tenant,gen_random_uuid(),member,account,session_id,expiry);
  RETURN tenant;
END $$;

CREATE FUNCTION stich_auth.logout(p_token text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE stich_auth.identity_sessions SET revoked_at=statement_timestamp() WHERE token_hash=p_token AND revoked_at IS NULL
$$;

CREATE FUNCTION stich_auth.request_reset(p_email text,p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid;
BEGIN
  SELECT id INTO account FROM stich_auth.identity_accounts WHERE normalised_email=p_email AND disabled_at IS NULL FOR UPDATE;
  IF account IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  UPDATE stich_auth.password_resets SET used_at=statement_timestamp() WHERE identity_id=account AND used_at IS NULL;
  INSERT INTO stich_auth.password_resets VALUES(p_token,account,statement_timestamp()+interval '20 minutes',NULL);
  RETURN true;
END $$;

CREATE FUNCTION stich_auth.reset_password(p_token text,p_password text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid;
BEGIN
  SELECT identity_id INTO account FROM stich_auth.password_resets WHERE token_hash=p_token;
  IF account IS NULL OR p_password !~ '^argon2id:65536:3:1:[a-f0-9]{32}:[a-f0-9]{64}$' THEN RETURN false; END IF;
  PERFORM 1 FROM stich_auth.identity_accounts WHERE id=account AND disabled_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE stich_auth.password_resets SET used_at=statement_timestamp() WHERE token_hash=p_token AND used_at IS NULL AND expires_at>statement_timestamp();
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE stich_auth.identity_accounts SET password_hash=p_password WHERE id=account;
  UPDATE stich_auth.password_resets SET used_at=statement_timestamp() WHERE identity_id=account AND used_at IS NULL;
  UPDATE stich_auth.identity_sessions SET revoked_at=statement_timestamp() WHERE identity_id=account AND revoked_at IS NULL;
  RETURN true;
END $$;

DO $body$
DECLARE runtime_name text := current_database() || '_runtime'; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['throttle(text,integer)','credentials(text)','login(text,text,text)','register_owner(text,text,text)','session_info(text)','onboard(text,text,text)','logout(text)','request_reset(text,text)','reset_password(text,text)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION stich_auth.%s FROM PUBLIC',fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION stich_auth.%s TO %I',fn,runtime_name);
  END LOOP;
END $body$;
