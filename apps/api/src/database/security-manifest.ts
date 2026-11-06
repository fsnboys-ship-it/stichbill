// Reviewed function bodies from immutable access migration; update only with reviewed SQL.
export const functionHashes: Record<string,string> = {
  "resolve_context": "d266f976b72a03924c88ba513fef68e023eed3eee885e8c0ee5b82370f4a4402",
  "can_access": "80741dc1057f254d29f12b17803854eccc74664f77fb324b436fac77a9e66c10",
  "is_owner": "85fa792033f8c956b3c51d9c3b0c7108cfd3a6b37f0ab1457d22b22b3c9cac76"
};
export const accessMigrationChecksum = '825df8a98a1559978697ee64e423d7a87686d19686905532309674b67e07eb36';

export const authFunctions = {
  "throttle": {
    "args": "text, integer",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "e1583e41ebccdcc6b334742ce7f7229c4a85b644580ce2e2ca5aca6e9baaae4c"
  },
  "credentials": {
    "args": "text",
    "language": "sql",
    "volatility": "s",
    "hash": "18d9ddc285cf661490e16992eb350d2395aa444c458d290177eeddfea264ea60"
  },
  "login": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "b6b88c5609275c6954cfc0e3e099d86af376d98cf94a80bf269b15cf3055e57f"
  },
  "register_owner": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "7fe8a76e7d1b467fd48bb96b771c779dec96b67febf018789c81224359f7d087"
  },
  "session_info": {
    "args": "text",
    "language": "sql",
    "volatility": "s",
    "hash": "f7f86eacb45e9d625f301a19c443735f8fea1981b476d7715cd2f524a3451d2b"
  },
  "onboard": {
    "args": "text, text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "7ff67e444828a04dbecc53e3fcae52530bcfc6fc6ca3f9bdf5733074157d7020"
  },
  "logout": {
    "args": "text",
    "language": "sql",
    "volatility": "v",
    "hash": "ee623d521aedda46c78c0ab428efe2005cc4a1ee2a9d9945b881be0f70566b83"
  },
  "request_reset": {
    "args": "text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "02bd3abdb4a47e91bd845d86dce19e0def6e3e3ae2cd697ef326e1862f6324dd"
  },
  "reset_password": {
    "args": "text, text",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "77f087cc58b9ca0406d3906c9f5c921c73511a4de24dbe00103ded557f24b89c"
  }
};

export const organisationFunctions = {
  "organisation_read": {
    "args": "uuid",
    "language": "plpgsql",
    "volatility": "s",
    "hash": "cf754cf5460bacaae326b199185ca3078617c6f78698daf8c40afbb9737b1f90"
  },
  "save_location": {
    "args": "uuid, text, uuid, uuid, text, text, text, text, boolean",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "f969639d2a18d895e56e4729df7936c9f685c7f5678c3f3cfb8b614866ea4428"
  },
  "save_staff": {
    "args": "uuid, uuid, text, text, text, boolean, jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "4a55f8853c04784b068a43cdabb33ee346755fdfad910b3e685fb795217c4462"
  }
};

// Task 004: explicit catalogue contracts; original function hashes remain unchanged.
export const catalogueFunctions = {
  "catalogue_scope": {
    "args": "uuid, uuid",
    "language": "sql",
    "volatility": "s",
    "hash": "e22151a889106878c1aa4bb2eac83b78c7e574a5f06e54b1a41d3d1280faf761"
  },
  "catalogue_read": {
    "args": "uuid, jsonb",
    "language": "plpgsql",
    "volatility": "s",
    "hash": "8ccf49a9d2aa286c4b7329aaa051d93a8b5fbb3f424cea03d4aa91c5c48b1acf"
  },
  "catalogue_save": {
    "args": "uuid, text, uuid, jsonb",
    "language": "plpgsql",
    "volatility": "v",
    "hash": "86b835c7bbdc3011429de367d00add73d234a4d254d9bc70c51ed3e1c23c02bc"
  }
};
export const catalogueTables: Record<string,{schema:string;policy:string;select:boolean}> = {
  "categories": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id) AND (active OR stich_auth.is_owner(tenant_id)))",
    "select": true
  },
  "brands": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id) AND (active OR stich_auth.is_owner(tenant_id)))",
    "select": true
  },
  "products": {
    "schema": "public",
    "policy": "stich_auth.catalogue_scope(tenant_id, id)",
    "select": true
  },
  "product_shops": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id, product_id) AND ((shop_id)::text = current_setting('app.catalogue_shop_id'::text, true)) AND (active OR stich_auth.is_owner(tenant_id)))",
    "select": true
  },
  "product_variants": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id, product_id) AND (active OR stich_auth.is_owner(tenant_id)))",
    "select": true
  },
  "variant_barcodes": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id, product_id) AND (active OR stich_auth.is_owner(tenant_id)) AND (EXISTS ( SELECT 1\n   FROM public.product_variants v\n  WHERE ((v.tenant_id = variant_barcodes.tenant_id) AND (v.id = variant_barcodes.variant_id)))))",
    "select": true
  },
  "catalogue_prices": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id, product_id) AND stich_auth.is_owner(tenant_id))",
    "select": false
  },
  "product_images": {
    "schema": "public",
    "policy": "(stich_auth.catalogue_scope(tenant_id, product_id) AND (EXISTS ( SELECT 1\n   FROM public.products p\n  WHERE ((p.tenant_id = product_images.tenant_id) AND (p.id = product_images.product_id) AND (p.image_id = product_images.id)))))",
    "select": true
  },
  "catalogue_events": {
    "schema": "stich_auth",
    "policy": "false",
    "select": false
  }
};
