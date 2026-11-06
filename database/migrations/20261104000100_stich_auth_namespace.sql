-- Task008: preserve object identities, grants, policies and data; change only the application namespace.
DO $namespace$
BEGIN
 IF current_user <> current_database() || '_migrator' THEN RAISE EXCEPTION 'Dedicated migrator required'; END IF;
 IF to_regnamespace('stich_auth') IS NULL THEN
  IF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='auth' AND nspowner=current_user::regrole) THEN
   RAISE EXCEPTION 'Application-owned legacy namespace required';
  END IF;
  ALTER SCHEMA auth RENAME TO stich_auth;
 ELSIF NOT EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='stich_auth' AND nspowner=current_user::regrole) THEN
  RAISE EXCEPTION 'Unexpected namespace owner';
 END IF;
END $namespace$;

CREATE OR REPLACE FUNCTION stich_auth.resolve_context(p_hash text, p_tenant uuid)
RETURNS TABLE(membership_id uuid, identity_id uuid, is_owner boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT m.id, m.identity_id,
    EXISTS(SELECT 1 FROM public.membership_roles r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id AND r.role_code='owner')
  FROM stich_auth.identity_sessions s
  JOIN stich_auth.identity_accounts a ON a.id=s.identity_id
  JOIN public.memberships m ON m.identity_id=a.id AND m.tenant_id=p_tenant
  JOIN public.tenants t ON t.id=m.tenant_id
  JOIN public.membership_sessions ms ON ms.tenant_id=m.tenant_id AND ms.membership_id=m.id AND ms.identity_session_id=s.id AND ms.identity_id=a.id
  WHERE s.token_hash=p_hash AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp()
    AND a.disabled_at IS NULL AND m.status='active' AND t.status='active'
    AND ms.revoked_at IS NULL AND ms.expires_at>statement_timestamp()
    AND EXISTS(SELECT 1 FROM public.membership_roles r WHERE r.tenant_id=m.tenant_id AND r.membership_id=m.id)
$$;

CREATE OR REPLACE FUNCTION stich_auth.can_access(p_tenant uuid, p_shop uuid DEFAULT NULL, p_branch uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT coalesce(p_tenant::text = nullif(current_setting('app.tenant_id',true),'') AND EXISTS (
    SELECT 1 FROM stich_auth.resolve_context(current_setting('app.session_hash',true),p_tenant) c
    WHERE c.membership_id::text = nullif(current_setting('app.membership_id',true),'')
      AND (c.is_owner OR p_shop IS NULL OR EXISTS (
        SELECT 1 FROM public.membership_scopes scope
        WHERE scope.tenant_id=p_tenant AND scope.membership_id=c.membership_id AND scope.shop_id=p_shop
          AND (p_branch IS NULL OR scope.all_shop_branches OR scope.branch_id=p_branch)
      ))
  ), false)
$$;

CREATE OR REPLACE FUNCTION stich_auth.is_owner(p_tenant uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
  SELECT stich_auth.can_access(p_tenant) AND EXISTS (
    SELECT 1 FROM stich_auth.resolve_context(current_setting('app.session_hash',true),p_tenant) c WHERE c.is_owner
  )
$$;

CREATE OR REPLACE FUNCTION stich_auth.throttle(p_key text, p_limit integer)
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

CREATE OR REPLACE FUNCTION stich_auth.credentials(p_email text)
RETURNS TABLE(password_hash text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT a.password_hash FROM stich_auth.identity_accounts a WHERE a.normalised_email=p_email AND a.disabled_at IS NULL
$$;

CREATE OR REPLACE FUNCTION stich_auth.login(p_email text,p_verified_hash text,p_token text)
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

CREATE OR REPLACE FUNCTION stich_auth.register_owner(p_email text,p_password text,p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid := gen_random_uuid();
BEGIN
  IF p_password !~ '^argon2id:65536:3:1:[a-f0-9]{32}:[a-f0-9]{64}$' OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  INSERT INTO stich_auth.identity_accounts(id,normalised_email,password_hash) VALUES(account,p_email,p_password) ON CONFLICT(normalised_email) DO NOTHING;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO stich_auth.identity_sessions(id,identity_id,token_hash,expires_at) VALUES(gen_random_uuid(),account,p_token,statement_timestamp()+interval '8 hours');
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION stich_auth.session_info(p_token text)
RETURNS TABLE(identity_id uuid,tenant_id uuid, business_name text) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
  SELECT a.id,t.id,t.name FROM stich_auth.identity_sessions s JOIN stich_auth.identity_accounts a ON a.id=s.identity_id
  LEFT JOIN public.membership_sessions ms ON ms.identity_session_id=s.id AND ms.identity_id=a.id AND ms.revoked_at IS NULL AND ms.expires_at>statement_timestamp()
  LEFT JOIN public.memberships m ON m.tenant_id=ms.tenant_id AND m.id=ms.membership_id AND m.identity_id=a.id AND m.status='active'
  LEFT JOIN public.tenants t ON t.id=m.tenant_id AND t.status='active'
  WHERE s.token_hash=p_token AND s.revoked_at IS NULL AND s.expires_at>statement_timestamp() AND a.disabled_at IS NULL
$$;

CREATE OR REPLACE FUNCTION stich_auth.onboard(p_token text,p_business text,p_owner text)
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

CREATE OR REPLACE FUNCTION stich_auth.logout(p_token text)
RETURNS void LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
  UPDATE stich_auth.identity_sessions SET revoked_at=statement_timestamp() WHERE token_hash=p_token AND revoked_at IS NULL
$$;

CREATE OR REPLACE FUNCTION stich_auth.request_reset(p_email text,p_token text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE account uuid;
BEGIN
  SELECT id INTO account FROM stich_auth.identity_accounts WHERE normalised_email=p_email AND disabled_at IS NULL FOR UPDATE;
  IF account IS NULL OR p_token !~ '^[a-f0-9]{64}$' THEN RETURN false; END IF;
  UPDATE stich_auth.password_resets SET used_at=statement_timestamp() WHERE identity_id=account AND used_at IS NULL;
  INSERT INTO stich_auth.password_resets VALUES(p_token,account,statement_timestamp()+interval '20 minutes',NULL);
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION stich_auth.reset_password(p_token text,p_password text)
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

CREATE OR REPLACE FUNCTION stich_auth.organisation_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT stich_auth.can_access(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('owner',stich_auth.is_owner(p_tenant),
 'shops',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.code) FROM public.shops s WHERE s.tenant_id=p_tenant AND (stich_auth.is_owner(p_tenant) OR (s.active AND stich_auth.can_access(p_tenant,s.id)))),'[]'::jsonb),
 'branches',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.code) FROM public.branches b JOIN public.shops s ON s.tenant_id=b.tenant_id AND s.id=b.shop_id WHERE b.tenant_id=p_tenant AND (stich_auth.is_owner(p_tenant) OR (b.active AND s.active AND stich_auth.can_access(p_tenant,b.shop_id,b.id)))),'[]'::jsonb),
 'staff',CASE WHEN stich_auth.is_owner(p_tenant) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status,'role',(SELECT role_code FROM public.membership_roles r WHERE r.tenant_id=p_tenant AND r.membership_id=m.id ORDER BY role_code DESC LIMIT 1),'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('shopId',s.shop_id,'branchId',s.branch_id)) FROM public.membership_scopes s WHERE s.tenant_id=p_tenant AND s.membership_id=m.id),'[]'::jsonb)) ORDER BY m.display_name) FROM public.memberships m WHERE m.tenant_id=p_tenant),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;

CREATE OR REPLACE FUNCTION stich_auth.save_location(p_tenant uuid,p_kind text,p_id uuid,p_shop uuid,p_code text,p_name text,p_address text,p_contact text,p_active boolean)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid := coalesce(p_id,gen_random_uuid());
BEGIN
 PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT stich_auth.is_owner(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_kind NOT IN ('shop','branch') OR length(btrim(p_address)) NOT BETWEEN 1 AND 500 OR p_active IS NULL THEN RAISE EXCEPTION 'Invalid details' USING ERRCODE='22023'; END IF;
 IF p_kind='shop' THEN
  IF length(btrim(p_contact)) NOT BETWEEN 1 AND 80 THEN RAISE EXCEPTION 'Invalid contact' USING ERRCODE='22023'; END IF;
  IF p_id IS NULL THEN INSERT INTO public.shops(tenant_id,id,code,name,address,contact,active) VALUES(p_tenant,target,p_code,p_name,p_address,p_contact,p_active);
  ELSE UPDATE public.shops SET code=p_code,name=p_name,address=p_address,contact=p_contact,active=p_active WHERE tenant_id=p_tenant AND id=target;
   IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  END IF;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.shops WHERE tenant_id=p_tenant AND id=p_shop) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN INSERT INTO public.branches(tenant_id,id,shop_id,code,name,address,active) VALUES(p_tenant,target,p_shop,p_code,p_name,p_address,p_active);
  ELSE UPDATE public.branches SET code=p_code,name=p_name,address=p_address,active=p_active WHERE tenant_id=p_tenant AND id=target AND shop_id=p_shop;
   IF NOT FOUND THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  END IF;
 END IF;
 RETURN target;
END $$;

CREATE OR REPLACE FUNCTION stich_auth.save_staff(p_tenant uuid,p_id uuid,p_email text,p_name text,p_role text,p_active boolean,p_scopes jsonb)
RETURNS uuid LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid := p_id; account uuid; actor uuid; scope jsonb; was_owner boolean;
BEGIN
 -- All organisation writers serialize per tenant; caller is revalidated after waiting.
 PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT stich_auth.is_owner(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 actor := current_setting('app.membership_id')::uuid;
 IF p_role NOT IN ('owner','cashier') OR p_role IS NULL OR p_active IS NULL OR jsonb_typeof(p_scopes) IS DISTINCT FROM 'array' OR jsonb_array_length(p_scopes)>100 THEN RAISE EXCEPTION 'Invalid access' USING ERRCODE='22023'; END IF;
 IF target IS NULL THEN
  SELECT id INTO account FROM stich_auth.identity_accounts WHERE normalised_email=p_email AND disabled_at IS NULL AND password_hash IS NOT NULL;
  IF account IS NULL THEN RAISE EXCEPTION 'Account unavailable' USING ERRCODE='22023'; END IF;
  target := gen_random_uuid();
  INSERT INTO public.memberships(tenant_id,id,identity_id,display_name) VALUES(p_tenant,target,account,p_name);
 ELSE
  SELECT identity_id INTO account FROM public.memberships WHERE tenant_id=p_tenant AND id=target;
  IF account IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 END IF;
 SELECT EXISTS(SELECT 1 FROM public.memberships m JOIN public.membership_roles r ON r.tenant_id=m.tenant_id AND r.membership_id=m.id WHERE m.tenant_id=p_tenant AND m.id=target AND m.status='active' AND r.role_code='owner') INTO was_owner;
 IF was_owner AND (NOT p_active OR p_role<>'owner') AND NOT EXISTS(
  SELECT 1 FROM public.memberships m JOIN public.membership_roles r ON r.tenant_id=m.tenant_id AND r.membership_id=m.id JOIN stich_auth.identity_accounts a ON a.id=m.identity_id
  WHERE m.tenant_id=p_tenant AND m.id<>target AND m.status='active' AND r.role_code='owner' AND a.disabled_at IS NULL
 ) THEN RAISE EXCEPTION 'Keep at least one active owner' USING ERRCODE='23514'; END IF;
 IF p_role='cashier' AND p_active AND jsonb_array_length(p_scopes)=0 THEN RAISE EXCEPTION 'Assign a shop or branch' USING ERRCODE='22023'; END IF;
 DELETE FROM public.membership_scopes WHERE tenant_id=p_tenant AND membership_id=target;
 FOR scope IN SELECT value FROM jsonb_array_elements(p_scopes) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.shops WHERE tenant_id=p_tenant AND id=(scope->>'shopId')::uuid AND active) THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='22023'; END IF;
  IF scope->>'branchId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE tenant_id=p_tenant AND shop_id=(scope->>'shopId')::uuid AND id=(scope->>'branchId')::uuid AND active) THEN RAISE EXCEPTION 'Invalid scope' USING ERRCODE='22023'; END IF;
  INSERT INTO public.membership_scopes(tenant_id,id,membership_id,shop_id,branch_id,all_shop_branches) VALUES(p_tenant,gen_random_uuid(),target,(scope->>'shopId')::uuid,(scope->>'branchId')::uuid,scope->>'branchId' IS NULL);
 END LOOP;
 UPDATE public.memberships SET display_name=p_name,status=CASE WHEN p_active THEN 'active' ELSE 'suspended' END WHERE tenant_id=p_tenant AND id=target;
 DELETE FROM public.membership_roles WHERE tenant_id=p_tenant AND membership_id=target;
 INSERT INTO public.membership_roles VALUES(p_tenant,target,p_role);
 UPDATE public.membership_sessions SET revoked_at=statement_timestamp() WHERE tenant_id=p_tenant AND membership_id=target AND revoked_at IS NULL;
 INSERT INTO stich_auth.access_events(tenant_id,actor_id,subject_id,action,details) VALUES(p_tenant,actor,target,CASE WHEN p_id IS NULL THEN 'staff_added' ELSE 'access_changed' END,jsonb_build_object('role',p_role,'active',p_active,'scopes',p_scopes));
 RETURN target;
END $$;

CREATE OR REPLACE FUNCTION stich_auth.catalogue_scope(p_tenant uuid,p_product uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(stich_auth.can_access(p_tenant) AND EXISTS(
  SELECT 1 FROM public.shops s WHERE s.tenant_id=p_tenant AND s.id=nullif(current_setting('app.catalogue_shop_id',true),'')::uuid AND s.active
  AND ((nullif(current_setting('app.catalogue_branch_id',true),'') IS NULL AND (stich_auth.is_owner(p_tenant) OR EXISTS(
    SELECT 1 FROM public.membership_scopes ms WHERE ms.tenant_id=p_tenant AND ms.membership_id=nullif(current_setting('app.membership_id',true),'')::uuid AND ms.shop_id=s.id AND ms.branch_id IS NULL
  ))) OR EXISTS(
    SELECT 1 FROM public.branches b WHERE b.tenant_id=p_tenant AND b.shop_id=s.id AND b.id=nullif(current_setting('app.catalogue_branch_id',true),'')::uuid AND b.active AND stich_auth.can_access(p_tenant,s.id,b.id)
  )) AND (p_product IS NULL OR EXISTS(
    SELECT 1 FROM public.products p JOIN public.product_shops ps ON ps.tenant_id=p.tenant_id AND ps.product_id=p.id
    WHERE p.tenant_id=p_tenant AND p.id=p_product AND ps.shop_id=s.id AND ps.active AND (p.active OR stich_auth.is_owner(p_tenant))
  ))
 ),false)
$$;

CREATE OR REPLACE FUNCTION stich_auth.catalogue_read(p_tenant uuid,p_query jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE managing boolean; result jsonb; page_no integer; total_rows integer;
BEGIN
 IF NOT stich_auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_query) k WHERE k NOT IN ('search','status','categoryId','brandId','productId','page')) OR length(coalesce(p_query->>'search',''))>120 OR coalesce(p_query->>'status','active') NOT IN ('active','inactive','all') OR coalesce(p_query->>'page','1') !~ '^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION 'Invalid filter' USING ERRCODE='22023'; END IF;
 managing:=stich_auth.is_owner(p_tenant); page_no:=coalesce((p_query->>'page')::integer,1);
 SELECT count(*) INTO total_rows FROM public.products p WHERE p.tenant_id=p_tenant AND stich_auth.catalogue_scope(p_tenant,p.id)
 AND (managing OR p.active) AND (coalesce(p_query->>'status','active')='all' OR p.active=(coalesce(p_query->>'status','active')='active'))
 AND (p_query->>'categoryId' IS NULL OR p.category_id=(p_query->>'categoryId')::uuid) AND (p_query->>'brandId' IS NULL OR p.brand_id=(p_query->>'brandId')::uuid)
 AND (p_query->>'productId' IS NULL OR p.id=(p_query->>'productId')::uuid)
 AND (coalesce(p_query->>'search','')='' OR position(lower(p_query->>'search') in lower(p.name||' '||p.style_code||' '||p.description))>0 OR EXISTS(
  SELECT 1 FROM public.product_variants v LEFT JOIN public.variant_barcodes b ON b.tenant_id=v.tenant_id AND b.variant_id=v.id AND b.active
  WHERE v.tenant_id=p_tenant AND v.product_id=p.id AND (v.active OR managing) AND (position(lower(p_query->>'search') in lower(v.sku||' '||v.size||' '||v.colour||' '||coalesce(b.barcode,'')))>0)
 ));
 SELECT coalesce(jsonb_agg(item ORDER BY item->>'name',item->>'id'),'[]'::jsonb) INTO result FROM (
 SELECT jsonb_build_object('id',p.id,'styleCode',p.style_code,'name',p.name,'description',p.description,'categoryId',p.category_id,'brandId',p.brand_id,'categoryName',c.name,'brandName',b.name,'hsnCode',p.hsn_code,'imageId',p.image_id,'active',p.active,'version',p.version,
 'shopIds',CASE WHEN managing THEN coalesce((SELECT jsonb_agg(ps.shop_id ORDER BY ps.shop_id) FROM public.product_shops ps WHERE ps.tenant_id=p_tenant AND ps.product_id=p.id AND ps.active),'[]'::jsonb) ELSE jsonb_build_array(nullif(current_setting('app.catalogue_shop_id',true),'')::uuid) END,
 'variants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'productId',p.id,'sku',v.sku,'size',v.size,'colour',v.colour,'active',v.active,'version',v.version,'sellingPrice',cp.selling_price::text,'mrp',cp.mrp::text,
  'barcodes',coalesce((SELECT jsonb_agg(bc.barcode ORDER BY bc.primary_flag DESC,bc.barcode) FROM public.variant_barcodes bc WHERE bc.tenant_id=p_tenant AND bc.variant_id=v.id AND bc.active),'[]'::jsonb)) || CASE WHEN managing THEN jsonb_build_object('costPrice',cp.cost_price::text) ELSE '{}'::jsonb END ORDER BY v.sku)
  FROM public.product_variants v JOIN public.catalogue_prices cp ON cp.tenant_id=v.tenant_id AND cp.variant_id=v.id WHERE v.tenant_id=p_tenant AND v.product_id=p.id AND (v.active OR managing)),'[]'::jsonb)) AS item
 FROM public.products p LEFT JOIN public.categories c ON c.tenant_id=p.tenant_id AND c.id=p.category_id LEFT JOIN public.brands b ON b.tenant_id=p.tenant_id AND b.id=p.brand_id
 WHERE p.tenant_id=p_tenant AND stich_auth.catalogue_scope(p_tenant,p.id) AND (managing OR p.active)
 AND (coalesce(p_query->>'status','active')='all' OR p.active=(coalesce(p_query->>'status','active')='active'))
 AND (p_query->>'categoryId' IS NULL OR p.category_id=(p_query->>'categoryId')::uuid) AND (p_query->>'brandId' IS NULL OR p.brand_id=(p_query->>'brandId')::uuid) AND (p_query->>'productId' IS NULL OR p.id=(p_query->>'productId')::uuid)
 AND (coalesce(p_query->>'search','')='' OR position(lower(p_query->>'search') in lower(p.name||' '||p.style_code||' '||p.description))>0 OR EXISTS(
  SELECT 1 FROM public.product_variants v LEFT JOIN public.variant_barcodes bc ON bc.tenant_id=v.tenant_id AND bc.variant_id=v.id AND bc.active WHERE v.tenant_id=p_tenant AND v.product_id=p.id AND (v.active OR managing) AND position(lower(p_query->>'search') in lower(v.sku||' '||v.size||' '||v.colour||' '||coalesce(bc.barcode,'')))>0
 )) ORDER BY p.name,p.id LIMIT 20 OFFSET (page_no-1)*20
 ) rows;
 RETURN jsonb_build_object('owner',managing,'products',result,'total',total_rows,'page',page_no,'pageSize',20,
 'categories',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active,'version',version) ORDER BY name) FROM public.categories WHERE tenant_id=p_tenant AND (active OR managing)),'[]'::jsonb),
 'brands',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'active',active,'version',version) ORDER BY name) FROM public.brands WHERE tenant_id=p_tenant AND (active OR managing)),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION stich_auth.catalogue_save(p_tenant uuid,p_kind text,p_id uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid:=coalesce(p_id,gen_random_uuid()); actor uuid; previous jsonb; following jsonb; allowed text[]; expected integer; shop uuid; alias text; index_no integer:=0; parent uuid;
BEGIN
 IF NOT stich_auth.is_owner(p_tenant) OR NOT stich_auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT stich_auth.is_owner(p_tenant) OR NOT stich_auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 actor:=current_setting('app.membership_id')::uuid;
 allowed:=CASE p_kind WHEN 'category' THEN ARRAY['name','active','version'] WHEN 'brand' THEN ARRAY['name','active','version'] WHEN 'product' THEN ARRAY['styleCode','name','description','categoryId','brandId','hsnCode','active','shopIds','version'] WHEN 'variant' THEN ARRAY['productId','sku','size','colour','active','costPrice','sellingPrice','mrp','barcodes','version'] WHEN 'image' THEN ARRAY['imageId','mime','byteLength','width','height','sha256','version'] END;
 IF allowed IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Invalid details' USING ERRCODE='22023'; END IF;
 IF p_kind='category' THEN SELECT to_jsonb(c) INTO previous FROM public.categories c WHERE c.tenant_id=p_tenant AND c.id=target;
 ELSIF p_kind='brand' THEN SELECT to_jsonb(b) INTO previous FROM public.brands b WHERE b.tenant_id=p_tenant AND b.id=target;
 ELSIF p_kind IN ('product','image') THEN SELECT to_jsonb(p) INTO previous FROM public.products p WHERE p.tenant_id=p_tenant AND p.id=target;
 ELSE SELECT to_jsonb(v) || jsonb_build_object('prices',(SELECT to_jsonb(cp) FROM public.catalogue_prices cp WHERE cp.tenant_id=p_tenant AND cp.variant_id=v.id),'barcodes',(SELECT jsonb_agg(to_jsonb(b)) FROM public.variant_barcodes b WHERE b.tenant_id=p_tenant AND b.variant_id=v.id)) INTO previous FROM public.product_variants v WHERE v.tenant_id=p_tenant AND v.id=target; END IF;
 IF p_id IS NOT NULL AND previous IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_kind IN ('product','image') AND p_id IS NOT NULL AND NOT stich_auth.catalogue_scope(p_tenant,target) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 expected:=(p_data->>'version')::integer;
 IF (p_id IS NULL AND expected IS NOT NULL) OR (p_id IS NOT NULL AND (expected IS NULL OR expected<>(previous->>'version')::integer)) THEN RAISE EXCEPTION 'Record changed; refresh' USING ERRCODE='40001'; END IF;
 IF p_kind<>'image' AND jsonb_typeof(p_data->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid active flag' USING ERRCODE='22023'; END IF;
 IF p_kind IN ('category','brand') THEN
  IF p_data->>'name' IS NULL OR length(btrim(p_data->>'name')) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid name' USING ERRCODE='22023'; END IF;
  IF p_kind='category' THEN
   INSERT INTO public.categories(tenant_id,id,name,active,created_by,updated_by) VALUES(p_tenant,target,btrim(p_data->>'name'),(p_data->>'active')::boolean,actor,actor)
   ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,active=excluded.active,version=public.categories.version+1,updated_at=statement_timestamp(),updated_by=actor;
   SELECT to_jsonb(c) INTO following FROM public.categories c WHERE c.tenant_id=p_tenant AND c.id=target;
  ELSE
   INSERT INTO public.brands(tenant_id,id,name,active,created_by,updated_by) VALUES(p_tenant,target,btrim(p_data->>'name'),(p_data->>'active')::boolean,actor,actor)
   ON CONFLICT(tenant_id,id) DO UPDATE SET name=excluded.name,active=excluded.active,version=public.brands.version+1,updated_at=statement_timestamp(),updated_by=actor;
   SELECT to_jsonb(b) INTO following FROM public.brands b WHERE b.tenant_id=p_tenant AND b.id=target;
  END IF;
 ELSIF p_kind='product' THEN
  IF NOT p_data ?& ARRAY['styleCode','name','description','categoryId','brandId','hsnCode','active','shopIds','version'] OR jsonb_typeof(p_data->'shopIds') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'shopIds') NOT BETWEEN 1 AND 50 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_data->'shopIds'))<>jsonb_array_length(p_data->'shopIds') THEN RAISE EXCEPTION 'Assign distinct shops' USING ERRCODE='22023'; END IF;
  FOR shop IN SELECT value::uuid FROM jsonb_array_elements_text(p_data->'shopIds') LOOP
   IF NOT EXISTS(SELECT 1 FROM public.shops WHERE tenant_id=p_tenant AND id=shop AND active) THEN RAISE EXCEPTION 'Invalid shop' USING ERRCODE='42501'; END IF;
  END LOOP;
  IF (p_data->>'categoryId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.categories WHERE tenant_id=p_tenant AND id=(p_data->>'categoryId')::uuid AND (active OR id=(previous->>'category_id')::uuid))) OR (p_data->>'brandId' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.brands WHERE tenant_id=p_tenant AND id=(p_data->>'brandId')::uuid AND (active OR id=(previous->>'brand_id')::uuid))) THEN RAISE EXCEPTION 'Invalid category or brand' USING ERRCODE='42501'; END IF;
  previous:=CASE WHEN previous IS NULL THEN NULL ELSE previous||jsonb_build_object('shopIds',(SELECT jsonb_agg(shop_id) FROM public.product_shops WHERE tenant_id=p_tenant AND product_id=target AND active)) END;
  INSERT INTO public.products(tenant_id,id,style_code,name,description,category_id,brand_id,hsn_code,active,created_by,updated_by)
   VALUES(p_tenant,target,upper(btrim(p_data->>'styleCode')),btrim(p_data->>'name'),p_data->>'description',(p_data->>'categoryId')::uuid,(p_data->>'brandId')::uuid,p_data->>'hsnCode',(p_data->>'active')::boolean,actor,actor)
  ON CONFLICT(tenant_id,id) DO UPDATE SET style_code=excluded.style_code,name=excluded.name,description=excluded.description,category_id=excluded.category_id,brand_id=excluded.brand_id,hsn_code=excluded.hsn_code,active=excluded.active,version=public.products.version+1,updated_at=statement_timestamp(),updated_by=actor;
  UPDATE public.product_shops SET active=false WHERE tenant_id=p_tenant AND product_id=target;
  FOR shop IN SELECT value::uuid FROM jsonb_array_elements_text(p_data->'shopIds') LOOP
   INSERT INTO public.product_shops(tenant_id,product_id,shop_id,created_by) VALUES(p_tenant,target,shop,actor) ON CONFLICT(tenant_id,product_id,shop_id) DO UPDATE SET active=true;
  END LOOP;
  SELECT to_jsonb(p)||jsonb_build_object('shopIds',p_data->'shopIds') INTO following FROM public.products p WHERE p.tenant_id=p_tenant AND p.id=target;
 ELSIF p_kind='variant' THEN
  IF NOT p_data ?& allowed OR jsonb_typeof(p_data->'barcodes') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'barcodes')>10 OR (SELECT count(DISTINCT value) FROM jsonb_array_elements_text(p_data->'barcodes'))<>jsonb_array_length(p_data->'barcodes') THEN RAISE EXCEPTION 'Invalid variant' USING ERRCODE='22023'; END IF;
  parent:=(p_data->>'productId')::uuid;
  IF NOT stich_auth.catalogue_scope(p_tenant,parent) OR (p_id IS NOT NULL AND parent<>(previous->>'product_id')::uuid) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each_text(p_data) p WHERE p.key IN ('costPrice','sellingPrice','mrp') AND (jsonb_typeof(p_data->p.key)<>'string' OR p.value !~ '^[0-9]{1,14}(\.[0-9]{1,6})?$')) THEN RAISE EXCEPTION 'Invalid decimal price' USING ERRCODE='22023'; END IF;
  INSERT INTO public.product_variants(tenant_id,id,product_id,sku,size,colour,active,created_by,updated_by) VALUES(p_tenant,target,parent,upper(btrim(p_data->>'sku')),upper(btrim(p_data->>'size')),upper(btrim(p_data->>'colour')),(p_data->>'active')::boolean,actor,actor)
  ON CONFLICT(tenant_id,id) DO UPDATE SET sku=excluded.sku,size=excluded.size,colour=excluded.colour,active=excluded.active,version=public.product_variants.version+1,updated_at=statement_timestamp(),updated_by=actor;
  INSERT INTO public.catalogue_prices(tenant_id,product_id,variant_id,cost_price,selling_price,mrp,updated_by) VALUES(p_tenant,parent,target,(p_data->>'costPrice')::numeric,(p_data->>'sellingPrice')::numeric,(p_data->>'mrp')::numeric,actor)
  ON CONFLICT(tenant_id,variant_id) DO UPDATE SET cost_price=excluded.cost_price,selling_price=excluded.selling_price,mrp=excluded.mrp,updated_at=statement_timestamp(),updated_by=actor;
  UPDATE public.variant_barcodes SET active=false,primary_flag=false WHERE tenant_id=p_tenant AND variant_id=target;
  FOR alias IN SELECT value FROM jsonb_array_elements_text(p_data->'barcodes') LOOP
   IF alias !~ '^[!-~]{1,64}$' THEN RAISE EXCEPTION 'Invalid barcode' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM public.variant_barcodes WHERE tenant_id=p_tenant AND barcode=alias AND variant_id<>target) THEN RAISE EXCEPTION 'Barcode already assigned' USING ERRCODE='23505'; END IF;
   INSERT INTO public.variant_barcodes(tenant_id,product_id,variant_id,barcode,primary_flag,created_by) VALUES(p_tenant,parent,target,alias,index_no=0,actor)
   ON CONFLICT(tenant_id,barcode) DO UPDATE SET active=true,primary_flag=excluded.primary_flag;
   index_no:=index_no+1;
  END LOOP;
  SELECT to_jsonb(v)||jsonb_build_object('prices',(SELECT to_jsonb(cp) FROM public.catalogue_prices cp WHERE cp.tenant_id=p_tenant AND cp.variant_id=target),'barcodes',p_data->'barcodes') INTO following FROM public.product_variants v WHERE v.tenant_id=p_tenant AND v.id=target;
 ELSE
  IF p_id IS NULL OR NOT p_data ?& ARRAY['version','imageId'] THEN RAISE EXCEPTION 'Invalid image' USING ERRCODE='22023'; END IF;
  IF p_data->>'imageId' IS NOT NULL THEN
   INSERT INTO public.product_images(tenant_id,id,product_id,mime,byte_length,width,height,sha256,created_by) VALUES(p_tenant,(p_data->>'imageId')::uuid,target,p_data->>'mime',(p_data->>'byteLength')::integer,(p_data->>'width')::integer,(p_data->>'height')::integer,p_data->>'sha256',actor);
  END IF;
  UPDATE public.products SET image_id=(p_data->>'imageId')::uuid,version=version+1,updated_at=statement_timestamp(),updated_by=actor WHERE tenant_id=p_tenant AND id=target;
  SELECT to_jsonb(p) INTO following FROM public.products p WHERE p.tenant_id=p_tenant AND p.id=target;
 END IF;
 INSERT INTO stich_auth.catalogue_events(tenant_id,actor_id,entity_kind,entity_id,before_data,after_data) VALUES(p_tenant,actor,p_kind,target,previous,following);
 RETURN jsonb_build_object('id',target,'version',(following->>'version')::integer);
END $$;
