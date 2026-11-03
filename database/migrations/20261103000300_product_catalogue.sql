-- Task 004 increment 1. Catalogue only: no stock, sales, taxes or purchasing.
CREATE TABLE public.categories (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 name text NOT NULL CHECK(name=btrim(name) AND length(name) BETWEEN 1 AND 120), active boolean NOT NULL DEFAULT true,
 version integer NOT NULL DEFAULT 1 CHECK(version>0), created_at timestamptz NOT NULL DEFAULT statement_timestamp(), updated_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 created_by uuid NOT NULL, updated_by uuid NOT NULL, PRIMARY KEY(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id), FOREIGN KEY(tenant_id,updated_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE UNIQUE INDEX categories_name ON public.categories(tenant_id,lower(name));
CREATE TABLE public.brands (LIKE public.categories INCLUDING DEFAULTS INCLUDING CONSTRAINTS INCLUDING INDEXES);
ALTER TABLE public.brands ADD FOREIGN KEY(tenant_id) REFERENCES public.tenants(id), ADD FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id), ADD FOREIGN KEY(tenant_id,updated_by) REFERENCES public.memberships(tenant_id,id);
CREATE TABLE public.products (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(),
 style_code text NOT NULL CHECK(style_code=upper(btrim(style_code)) AND style_code ~ '^[A-Z0-9][A-Z0-9._/-]{0,39}$'),
 name text NOT NULL CHECK(name=btrim(name) AND length(name) BETWEEN 1 AND 160), description text NOT NULL DEFAULT '' CHECK(length(description)<=2000),
 category_id uuid, brand_id uuid, hsn_code text NOT NULL DEFAULT '' CHECK(hsn_code='' OR hsn_code ~ '^[0-9]{4,8}$'), image_id uuid,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), updated_at timestamptz NOT NULL DEFAULT statement_timestamp(), created_by uuid NOT NULL, updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,style_code), FOREIGN KEY(tenant_id,category_id) REFERENCES public.categories(tenant_id,id), FOREIGN KEY(tenant_id,brand_id) REFERENCES public.brands(tenant_id,id),
 FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id), FOREIGN KEY(tenant_id,updated_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE INDEX products_category ON public.products(tenant_id,category_id);
CREATE INDEX products_brand ON public.products(tenant_id,brand_id);
CREATE INDEX products_name ON public.products(tenant_id,lower(name));
CREATE TABLE public.product_shops (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), product_id uuid NOT NULL, shop_id uuid NOT NULL, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), created_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,product_id,shop_id), FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id), FOREIGN KEY(tenant_id,shop_id) REFERENCES public.shops(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE INDEX product_shops_scope ON public.product_shops(tenant_id,shop_id,product_id);
CREATE TABLE public.product_variants (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(), product_id uuid NOT NULL,
 sku text NOT NULL CHECK(sku=upper(btrim(sku)) AND sku ~ '^[A-Z0-9][A-Z0-9._/-]{0,63}$'),
 size text NOT NULL DEFAULT 'NA' CHECK(size=upper(btrim(size)) AND length(size) BETWEEN 1 AND 40), colour text NOT NULL DEFAULT 'NA' CHECK(colour=upper(btrim(colour)) AND length(colour) BETWEEN 1 AND 60),
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), updated_at timestamptz NOT NULL DEFAULT statement_timestamp(), created_by uuid NOT NULL, updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,sku), UNIQUE(tenant_id,product_id,size,colour), UNIQUE(tenant_id,product_id,id),
 FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id), FOREIGN KEY(tenant_id,updated_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE TABLE public.variant_barcodes (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(), product_id uuid NOT NULL, variant_id uuid NOT NULL,
 barcode text NOT NULL CHECK(barcode ~ '^[!-~]{1,64}$'), primary_flag boolean NOT NULL DEFAULT false, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), created_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,barcode), FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE INDEX variant_barcodes_variant ON public.variant_barcodes(tenant_id,product_id,variant_id);
CREATE UNIQUE INDEX variant_barcodes_primary ON public.variant_barcodes(tenant_id,variant_id) WHERE active AND primary_flag;
CREATE TABLE public.catalogue_prices (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), product_id uuid NOT NULL, variant_id uuid NOT NULL,
 cost_price numeric(20,6) NOT NULL CHECK(cost_price BETWEEN 0 AND 99999999999999.999999),
 selling_price numeric(20,6) NOT NULL CHECK(selling_price BETWEEN 0 AND 99999999999999.999999), mrp numeric(20,6) NOT NULL CHECK(mrp BETWEEN 0 AND 99999999999999.999999 AND selling_price<=mrp),
 updated_at timestamptz NOT NULL DEFAULT statement_timestamp(), updated_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,variant_id), FOREIGN KEY(tenant_id,product_id,variant_id) REFERENCES public.product_variants(tenant_id,product_id,id), FOREIGN KEY(tenant_id,updated_by) REFERENCES public.memberships(tenant_id,id)
);
CREATE INDEX catalogue_prices_product ON public.catalogue_prices(tenant_id,product_id,variant_id);
CREATE TABLE public.product_images (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL, product_id uuid NOT NULL,
 mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg','image/webp')), byte_length integer NOT NULL CHECK(byte_length BETWEEN 1 AND 2097152),
 width integer NOT NULL CHECK(width BETWEEN 1 AND 4096), height integer NOT NULL CHECK(height BETWEEN 1 AND 4096), sha256 text NOT NULL CHECK(sha256 ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT statement_timestamp(), created_by uuid NOT NULL,
 PRIMARY KEY(tenant_id,id), UNIQUE(tenant_id,product_id,id), FOREIGN KEY(tenant_id,product_id) REFERENCES public.products(tenant_id,id), FOREIGN KEY(tenant_id,created_by) REFERENCES public.memberships(tenant_id,id)
);
ALTER TABLE public.products ADD FOREIGN KEY(tenant_id,id,image_id) REFERENCES public.product_images(tenant_id,product_id,id);
CREATE TABLE auth.catalogue_events (
 tenant_id uuid NOT NULL REFERENCES public.tenants(id), id uuid NOT NULL DEFAULT gen_random_uuid(), actor_id uuid NOT NULL,
 entity_kind text NOT NULL CHECK(entity_kind IN ('product','category','brand','variant','image')), entity_id uuid NOT NULL,
 occurred_at timestamptz NOT NULL DEFAULT statement_timestamp(), before_data jsonb, after_data jsonb NOT NULL,
 PRIMARY KEY(tenant_id,id), FOREIGN KEY(tenant_id,actor_id) REFERENCES public.memberships(tenant_id,id)
);
CREATE INDEX catalogue_events_entity ON auth.catalogue_events(tenant_id,entity_kind,entity_id,occurred_at);

-- The requested shop/branch is checked against server membership, never a client role.
CREATE FUNCTION auth.catalogue_scope(p_tenant uuid,p_product uuid DEFAULT NULL)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
 SELECT coalesce(auth.can_access(p_tenant) AND EXISTS(
  SELECT 1 FROM public.shops s WHERE s.tenant_id=p_tenant AND s.id=nullif(current_setting('app.catalogue_shop_id',true),'')::uuid AND s.active
  AND ((nullif(current_setting('app.catalogue_branch_id',true),'') IS NULL AND (auth.is_owner(p_tenant) OR EXISTS(
    SELECT 1 FROM public.membership_scopes ms WHERE ms.tenant_id=p_tenant AND ms.membership_id=nullif(current_setting('app.membership_id',true),'')::uuid AND ms.shop_id=s.id AND ms.branch_id IS NULL
  ))) OR EXISTS(
    SELECT 1 FROM public.branches b WHERE b.tenant_id=p_tenant AND b.shop_id=s.id AND b.id=nullif(current_setting('app.catalogue_branch_id',true),'')::uuid AND b.active AND auth.can_access(p_tenant,s.id,b.id)
  )) AND (p_product IS NULL OR EXISTS(
    SELECT 1 FROM public.products p JOIN public.product_shops ps ON ps.tenant_id=p.tenant_id AND ps.product_id=p.id
    WHERE p.tenant_id=p_tenant AND p.id=p_product AND ps.shop_id=s.id AND ps.active AND (p.active OR auth.is_owner(p_tenant))
  ))
 ),false)
$$;

CREATE FUNCTION auth.catalogue_read(p_tenant uuid,p_query jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE managing boolean; result jsonb; page_no integer; total_rows integer;
BEGIN
 IF NOT auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_query) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_query) k WHERE k NOT IN ('search','status','categoryId','brandId','productId','page')) OR length(coalesce(p_query->>'search',''))>120 OR coalesce(p_query->>'status','active') NOT IN ('active','inactive','all') OR coalesce(p_query->>'page','1') !~ '^[1-9][0-9]{0,5}$' THEN RAISE EXCEPTION 'Invalid filter' USING ERRCODE='22023'; END IF;
 managing:=auth.is_owner(p_tenant); page_no:=coalesce((p_query->>'page')::integer,1);
 SELECT count(*) INTO total_rows FROM public.products p WHERE p.tenant_id=p_tenant AND auth.catalogue_scope(p_tenant,p.id)
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
 WHERE p.tenant_id=p_tenant AND auth.catalogue_scope(p_tenant,p.id) AND (managing OR p.active)
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

CREATE FUNCTION auth.catalogue_save(p_tenant uuid,p_kind text,p_id uuid,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=pg_catalog AS $$
DECLARE target uuid:=coalesce(p_id,gen_random_uuid()); actor uuid; previous jsonb; following jsonb; allowed text[]; expected integer; shop uuid; alias text; index_no integer:=0; parent uuid;
BEGIN
 IF NOT auth.is_owner(p_tenant) OR NOT auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.tenants WHERE id=p_tenant FOR UPDATE;
 IF NOT auth.is_owner(p_tenant) OR NOT auth.catalogue_scope(p_tenant) THEN RAISE EXCEPTION 'Owner access required' USING ERRCODE='42501'; END IF;
 actor:=current_setting('app.membership_id')::uuid;
 allowed:=CASE p_kind WHEN 'category' THEN ARRAY['name','active','version'] WHEN 'brand' THEN ARRAY['name','active','version'] WHEN 'product' THEN ARRAY['styleCode','name','description','categoryId','brandId','hsnCode','active','shopIds','version'] WHEN 'variant' THEN ARRAY['productId','sku','size','colour','active','costPrice','sellingPrice','mrp','barcodes','version'] WHEN 'image' THEN ARRAY['imageId','mime','byteLength','width','height','sha256','version'] END;
 IF allowed IS NULL OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) k WHERE NOT k=ANY(allowed)) THEN RAISE EXCEPTION 'Invalid details' USING ERRCODE='22023'; END IF;
 IF p_kind='category' THEN SELECT to_jsonb(c) INTO previous FROM public.categories c WHERE c.tenant_id=p_tenant AND c.id=target;
 ELSIF p_kind='brand' THEN SELECT to_jsonb(b) INTO previous FROM public.brands b WHERE b.tenant_id=p_tenant AND b.id=target;
 ELSIF p_kind IN ('product','image') THEN SELECT to_jsonb(p) INTO previous FROM public.products p WHERE p.tenant_id=p_tenant AND p.id=target;
 ELSE SELECT to_jsonb(v) || jsonb_build_object('prices',(SELECT to_jsonb(cp) FROM public.catalogue_prices cp WHERE cp.tenant_id=p_tenant AND cp.variant_id=v.id),'barcodes',(SELECT jsonb_agg(to_jsonb(b)) FROM public.variant_barcodes b WHERE b.tenant_id=p_tenant AND b.variant_id=v.id)) INTO previous FROM public.product_variants v WHERE v.tenant_id=p_tenant AND v.id=target; END IF;
 IF p_id IS NOT NULL AND previous IS NULL THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
 IF p_kind IN ('product','image') AND p_id IS NOT NULL AND NOT auth.catalogue_scope(p_tenant,target) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
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
  IF NOT auth.catalogue_scope(p_tenant,parent) OR (p_id IS NOT NULL AND parent<>(previous->>'product_id')::uuid) THEN RAISE EXCEPTION 'Access denied' USING ERRCODE='42501'; END IF;
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
 INSERT INTO auth.catalogue_events(tenant_id,actor_id,entity_kind,entity_id,before_data,after_data) VALUES(p_tenant,actor,p_kind,target,previous,following);
 RETURN jsonb_build_object('id',target,'version',(following->>'version')::integer);
END $$;

DO $body$
DECLARE table_name text; schema_name text; expression text; runtime_name text:=current_database()||'_runtime'; migrator_name text:=current_database()||'_migrator'; fn text;
BEGIN
 IF current_user<>migrator_name THEN RAISE EXCEPTION 'Dedicated migrator required'; END IF;
 FOREACH table_name IN ARRAY ARRAY['categories','brands','products','product_shops','product_variants','variant_barcodes','catalogue_prices','product_images','catalogue_events'] LOOP
  schema_name:=CASE WHEN table_name='catalogue_events' THEN 'auth' ELSE 'public' END;
  EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',schema_name,table_name);
  EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',schema_name,table_name);
  EXECUTE format('CREATE POLICY migration_access ON %I.%I TO %I USING(true) WITH CHECK(true)',schema_name,table_name,migrator_name);
  expression:=CASE table_name
   WHEN 'categories' THEN '(auth.catalogue_scope(tenant_id) AND (active OR auth.is_owner(tenant_id)))'
   WHEN 'brands' THEN '(auth.catalogue_scope(tenant_id) AND (active OR auth.is_owner(tenant_id)))'
   WHEN 'products' THEN 'auth.catalogue_scope(tenant_id,id)'
   WHEN 'product_shops' THEN '(auth.catalogue_scope(tenant_id,product_id) AND shop_id::text=current_setting(''app.catalogue_shop_id'',true) AND (active OR auth.is_owner(tenant_id)))'
   WHEN 'product_variants' THEN '(auth.catalogue_scope(tenant_id,product_id) AND (active OR auth.is_owner(tenant_id)))'
   WHEN 'variant_barcodes' THEN '(auth.catalogue_scope(tenant_id,product_id) AND (active OR auth.is_owner(tenant_id)) AND EXISTS(SELECT 1 FROM public.product_variants v WHERE v.tenant_id=variant_barcodes.tenant_id AND v.id=variant_barcodes.variant_id))'
   WHEN 'catalogue_prices' THEN '(auth.catalogue_scope(tenant_id,product_id) AND auth.is_owner(tenant_id))'
   WHEN 'product_images' THEN '(auth.catalogue_scope(tenant_id,product_id) AND EXISTS(SELECT 1 FROM public.products p WHERE p.tenant_id=product_images.tenant_id AND p.id=product_images.product_id AND p.image_id=product_images.id))'
   ELSE 'false' END;
  EXECUTE format('CREATE POLICY runtime_read ON %I.%I FOR SELECT TO %I USING(%s)',schema_name,table_name,runtime_name,expression);
  IF table_name NOT IN ('catalogue_prices','catalogue_events') THEN EXECUTE format('GRANT SELECT ON %I.%I TO %I',schema_name,table_name,runtime_name); END IF;
 END LOOP;
 FOREACH fn IN ARRAY ARRAY['catalogue_scope(uuid,uuid)','catalogue_read(uuid,jsonb)','catalogue_save(uuid,text,uuid,jsonb)'] LOOP
  EXECUTE format('REVOKE ALL ON FUNCTION auth.%s FROM PUBLIC',fn);
  EXECUTE format('GRANT EXECUTE ON FUNCTION auth.%s TO %I',fn,runtime_name);
 END LOOP;
END $body$;
