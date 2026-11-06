-- Preserve historical records; new commands require address and contact details.
ALTER TABLE public.shops ADD COLUMN address text NOT NULL DEFAULT '' CHECK(length(address)<=500), ADD COLUMN contact text NOT NULL DEFAULT '' CHECK(length(contact)<=80);
ALTER TABLE public.branches ADD COLUMN address text NOT NULL DEFAULT '' CHECK(length(address)<=500);
CREATE TABLE stich_auth.access_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), tenant_id uuid NOT NULL REFERENCES public.tenants(id),
 actor_id uuid NOT NULL, subject_id uuid NOT NULL, action text NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(), details jsonb NOT NULL
);
-- No runtime grants: events can only be appended by the reviewed staff command.
CREATE FUNCTION stich_auth.organisation_read(p_tenant uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
BEGIN
 IF NOT stich_auth.can_access(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('owner',stich_auth.is_owner(p_tenant),
 'shops',coalesce((SELECT jsonb_agg(to_jsonb(s) ORDER BY s.code) FROM public.shops s WHERE s.tenant_id=p_tenant AND (stich_auth.is_owner(p_tenant) OR (s.active AND stich_auth.can_access(p_tenant,s.id)))),'[]'::jsonb),
 'branches',coalesce((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.code) FROM public.branches b JOIN public.shops s ON s.tenant_id=b.tenant_id AND s.id=b.shop_id WHERE b.tenant_id=p_tenant AND (stich_auth.is_owner(p_tenant) OR (b.active AND s.active AND stich_auth.can_access(p_tenant,b.shop_id,b.id)))),'[]'::jsonb),
 'staff',CASE WHEN stich_auth.is_owner(p_tenant) THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'name',m.display_name,'status',m.status,'role',(SELECT role_code FROM public.membership_roles r WHERE r.tenant_id=p_tenant AND r.membership_id=m.id ORDER BY role_code DESC LIMIT 1),'scopes',coalesce((SELECT jsonb_agg(jsonb_build_object('shopId',s.shop_id,'branchId',s.branch_id)) FROM public.membership_scopes s WHERE s.tenant_id=p_tenant AND s.membership_id=m.id),'[]'::jsonb)) ORDER BY m.display_name) FROM public.memberships m WHERE m.tenant_id=p_tenant),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
CREATE FUNCTION stich_auth.save_location(p_tenant uuid,p_kind text,p_id uuid,p_shop uuid,p_code text,p_name text,p_address text,p_contact text,p_active boolean)
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
CREATE FUNCTION stich_auth.save_staff(p_tenant uuid,p_id uuid,p_email text,p_name text,p_role text,p_active boolean,p_scopes jsonb)
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
DO $body$
DECLARE fn text;
BEGIN
 FOREACH fn IN ARRAY ARRAY['organisation_read(uuid)','save_location(uuid,text,uuid,uuid,text,text,text,text,boolean)','save_staff(uuid,uuid,text,text,text,boolean,jsonb)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION stich_auth.%s FROM PUBLIC',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION stich_auth.%s TO %I',fn,current_database()||'_runtime');
 END LOOP;
END $body$;
