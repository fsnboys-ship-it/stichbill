import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from './connection.js';
import { functionHashes } from './security-manifest.js';

export const tenantTables = ['tenants','memberships','shops','branches','roles','membership_roles','membership_scopes','membership_sessions'];
type Grant = { role: string; privilege: string; grantable: boolean; grantor: string };
type Role = { name: string; super: boolean; bypass: boolean; replication: boolean; createRole: boolean; createDb: boolean; inherit: boolean; login: boolean; settings: string[] | null };
type Relation = { schema: string; name: string; kind: string; owner: string; rls: boolean; force: boolean; acl: Grant[]; columnAcl: boolean };
type Policy = { table: string; name: string; command: string; permissive: boolean; roles: string[]; using: string | null; check: string | null };
type FunctionInfo = { schema: string; name: string; args: string; owner: string; definer: boolean; language: string; volatility: string; settings: string[] | null; body: string; acl: Grant[]; executable: boolean };
type Snapshot = { database: string; currentUser: string; admin: string; adminSafe: boolean; dbAcl: Grant[]; roles: Role[]; memberships: number; ownedDatabases: number; unexpectedSystemPrivileges: number; unexpectedOwnership: number;
  schemas: {name:string;owner:string;acl:Grant[]}[]; relations: Relation[]; policies: Policy[]; functions: FunctionInfo[]; defaults: {schema:string;kind:string;acl:Grant[]}[] };

// Static catalog SQL only. The same implementation is used before provisioning and by readiness.
export async function inspectSecurity(db: Kysely<Database>): Promise<Snapshot> {
  const {rows}=await sql<Snapshot>`WITH names AS (SELECT current_database() || '_runtime' AS runtime,current_database() || '_migrator' AS migrator),
    owned_toast AS (
      SELECT c.reltoastrelid AS oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace,names WHERE n.nspname IN ('public','auth') AND c.relowner=to_regrole(migrator) AND c.reltoastrelid<>0
      UNION SELECT i.indexrelid FROM pg_index i JOIN pg_class c ON c.reltoastrelid=i.indrelid JOIN pg_namespace n ON n.oid=c.relnamespace,names WHERE n.nspname IN ('public','auth') AND c.relowner=to_regrole(migrator)
    ),
    grants AS (
      SELECT 'db' AS kind,d.oid AS object,a.* FROM pg_database d CROSS JOIN LATERAL aclexplode(coalesce(d.datacl,acldefault('d',d.datdba))) a
      UNION ALL SELECT 'schema',n.oid,a.* FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
      UNION ALL SELECT 'table',c.oid,a.* FROM pg_class c CROSS JOIN LATERAL aclexplode(coalesce(c.relacl,acldefault('r',c.relowner))) a
      UNION ALL SELECT 'function',p.oid,a.* FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
      UNION ALL SELECT 'default',d.oid,a.* FROM pg_default_acl d CROSS JOIN LATERAL aclexplode(d.defaclacl) a
    ), acls AS (SELECT kind,object,jsonb_agg(jsonb_build_object('role',CASE WHEN grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(grantee) END,'privilege',privilege_type,'grantable',is_grantable,'grantor',pg_get_userbyid(grantor))) AS acl FROM grants GROUP BY kind,object)
    SELECT current_database() AS database,current_user AS "currentUser",pg_get_userbyid(d.datdba) AS admin,
    (SELECT rolsuper AND rolcanlogin FROM pg_roles WHERE oid=d.datdba) AS "adminSafe",
    (SELECT acl FROM acls WHERE kind='db' AND object=d.oid) AS "dbAcl",
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name',rolname,'super',rolsuper,'bypass',rolbypassrls,'replication',rolreplication,'createRole',rolcreaterole,'createDb',rolcreatedb,'inherit',rolinherit,'login',rolcanlogin,'settings',rolconfig)),'[]') FROM pg_roles,names WHERE rolname IN (runtime,migrator)) AS roles,
    (SELECT count(*)::int FROM pg_auth_members m WHERE m.member IN (SELECT oid FROM pg_roles,names WHERE rolname IN (runtime,migrator)) OR m.roleid IN (SELECT oid FROM pg_roles,names WHERE rolname IN (runtime,migrator))) AS memberships,
    (SELECT count(*)::int FROM pg_database WHERE datdba IN (SELECT oid FROM pg_roles,names WHERE rolname IN (runtime,migrator))) AS "ownedDatabases",
    (SELECT count(*)::int FROM grants g,names WHERE g.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN (runtime,migrator)) AND (
      (g.kind='db' AND g.object<>d.oid) OR
      (g.kind='table' AND (g.object NOT IN (SELECT oid FROM owned_toast) OR g.grantee<>to_regrole(names.migrator)) AND g.object IN (SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname ~ '^pg_' OR n.nspname='information_schema')) OR
      (g.kind='function' AND g.object IN (SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname ~ '^pg_' OR n.nspname='information_schema')) OR
      (g.kind='schema' AND g.object IN (SELECT oid FROM pg_namespace WHERE nspname ~ '^pg_' OR nspname='information_schema'))
    )) + (SELECT count(*)::int FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace CROSS JOIN LATERAL aclexplode(a.attacl) x,names WHERE n.nspname ~ '^pg_' AND x.grantee IN (SELECT oid FROM pg_roles WHERE rolname IN(runtime,migrator))) + (SELECT CASE WHEN to_regrole(runtime) IS NULL THEN 0 WHEN has_any_column_privilege(runtime,'pg_catalog.pg_authid','SELECT') OR has_table_privilege(runtime,'pg_catalog.pg_shadow','SELECT') THEN 1 ELSE 0 END FROM names) AS "unexpectedSystemPrivileges",
    (SELECT count(*)::int FROM (
      SELECT c.relowner AS owner,n.nspname AS schema FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE c.oid NOT IN (SELECT oid FROM owned_toast)
      UNION ALL SELECT p.proowner,n.nspname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      UNION ALL SELECT nspowner,nspname FROM pg_namespace
    ) objects,names WHERE owner IN (SELECT oid FROM pg_roles WHERE rolname IN(runtime,migrator)) AND schema NOT IN ('auth','public')) AS "unexpectedOwnership",
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',coalesce(a.acl,'[]'))),'[]') FROM pg_namespace n LEFT JOIN acls a ON a.kind='schema' AND a.object=n.oid WHERE nspname !~ '^pg_' AND nspname<>'information_schema') AS schemas,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',coalesce(a.acl,'[]'),'columnAcl',EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=c.oid AND attacl IS NOT NULL))),'[]') FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN acls a ON a.kind='table' AND a.object=c.oid WHERE n.nspname !~ '^pg_' AND n.nspname<>'information_schema') AS relations,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('table',c.relname,'name',p.polname,'command',p.polcmd,'permissive',p.polpermissive,'roles',ARRAY(SELECT CASE WHEN r=0 THEN 'PUBLIC' ELSE pg_get_userbyid(r) END FROM unnest(p.polroles) r),'using',pg_get_expr(p.polqual,p.polrelid),'check',pg_get_expr(p.polwithcheck,p.polrelid))),'[]') FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS policies,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('schema',n.nspname,'name',p.proname,'args',oidvectortypes(p.proargtypes),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'language',l.lanname,'volatility',p.provolatile,'settings',p.proconfig,'body',p.prosrc,'acl',coalesce(a.acl,'[]'),'executable',CASE WHEN to_regrole(names.runtime) IS NULL THEN false ELSE has_function_privilege(names.runtime,p.oid,'EXECUTE') END)),'[]') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang CROSS JOIN names LEFT JOIN acls a ON a.kind='function' AND a.object=p.oid WHERE (n.nspname !~ '^pg_' AND n.nspname<>'information_schema') OR p.prosecdef) AS functions,
    (SELECT coalesce(jsonb_agg(jsonb_build_object('schema',CASE WHEN x.defaclnamespace=0 THEN '*' ELSE x.defaclnamespace::regnamespace::text END,'kind',x.defaclobjtype,'acl',coalesce(a.acl,'[]'))),'[]') FROM pg_default_acl x LEFT JOIN acls a ON a.kind='default' AND a.object=x.oid WHERE x.defaclrole IN (SELECT oid FROM pg_roles,names WHERE rolname IN (runtime,migrator))) AS defaults
    FROM pg_database d WHERE datname=current_database()`.execute(db);
  if(!rows[0]) throw new Error('Unsafe database configuration: missing catalog');
  return rows[0];
}
function requireSafe(condition: unknown, code: string): asserts condition {
  if(!condition) throw new Error(`Unsafe database configuration: ${code}`);
}
function aclMatches(acl: Grant[], owner: string, others: Record<string,string[]>): boolean {
  const remaining = new Set(Object.entries(others).flatMap(([role,permissions])=>permissions.map(p=>`${role}:${p}`)));
  for(const grant of acl) {
    if(grant.role===owner && grant.grantor===owner) continue;
    if(grant.grantor!==owner || grant.grantable || !remaining.delete(`${grant.role}:${grant.privilege}`)) return false;
  }
  return remaining.size===0;
}
const normal=(value: string | null)=>value?.replace(/\s+/g,' ').trim() ?? null;
const readExpressions: Record<string,string> = {
  tenants:'auth.can_access(id)', roles:'auth.can_access(tenant_id)', shops:'(active AND auth.can_access(tenant_id, id))',
  branches:'(active AND auth.can_access(tenant_id, shop_id, id) AND (EXISTS ( SELECT 1 FROM public.shops s WHERE ((s.tenant_id = branches.tenant_id) AND (s.id = branches.shop_id) AND s.active))))',
};
for(const table of ['memberships','membership_roles','membership_scopes','membership_sessions']) {
  const id=table==='memberships'?'id':'membership_id';
  readExpressions[table]=`(auth.can_access(tenant_id) AND (auth.is_owner(tenant_id) OR ((${id})::text = current_setting('app.membership_id'::text, true))))`;
}
export function validateSecurity(s: Snapshot, mode: 'provision'|'ready', expectedAdmin?: string, allowLegacyDefaults=false): 'fresh'|'provisioned'|'schema' {
  const runtime=`${s.database}_runtime`, migrator=`${s.database}_migrator`;
  requireSafe(s.adminSafe && ![runtime,migrator].includes(s.admin) && (!expectedAdmin || s.admin===expectedAdmin),'administrator ownership');
  requireSafe(mode!=='ready' || s.currentUser===runtime,'runtime identity');
  requireSafe(s.memberships===0 && s.ownedDatabases===0 && s.unexpectedSystemPrivileges===0 && s.unexpectedOwnership===0,'role membership or database ownership');
  for(const r of s.roles) requireSafe(!r.super && !r.bypass && !r.replication && !r.createRole && !r.createDb && !r.inherit && r.login && !r.settings?.length,'role attributes');
  if(s.roles.length===0) {
    requireSafe(mode==='provision' && s.relations.length===0 && s.functions.length===0 && s.defaults.length===0 && s.schemas.length===1 && s.schemas[0]?.name==='public','fresh database only');
    requireSafe(aclMatches(s.dbAcl,s.admin,{PUBLIC:['CONNECT','TEMPORARY']}),'fresh database ACL');
    const schema=s.schemas[0]!;
    requireSafe(['pg_database_owner',s.admin].includes(schema.owner) && aclMatches(schema.acl,schema.owner,{PUBLIC:['USAGE']}),'fresh schema ACL');
    return 'fresh';
  }
  requireSafe(s.roles.length===2,'partial roles');
  requireSafe(aclMatches(s.dbAcl,s.admin,{[runtime]:['CONNECT'],[migrator]:['CONNECT','CREATE']}),'database ACL');
  requireSafe(s.schemas.every(n=>['public','auth'].includes(n.name) && n.owner===migrator && aclMatches(n.acl,migrator,n.name==='public'?{PUBLIC:['USAGE'],[runtime]:['USAGE']}:{[runtime]:['USAGE']})),'schema ownership or ACL');
  requireSafe(s.schemas.some(n=>n.name==='public'),'public schema');
  if(s.relations.length===0) {
    requireSafe(mode==='provision' && s.schemas.length===1 && s.functions.length===0 && s.defaults.length===0 && s.policies.length===0,'unmigrated database');
    return 'provisioned';
  }
  const expectedTables=[...tenantTables.map(t=>`public.${t}`),'public.migration_history','auth.identity_accounts','auth.identity_sessions'];
  const tables=s.relations.filter(t=>t.kind==='r');
  requireSafe(tables.length===expectedTables.length && tables.every(t=>expectedTables.includes(`${t.schema}.${t.name}`)),'protected table set');
  requireSafe(s.schemas.length===2 && s.relations.every(r=>r.owner===migrator && ['r','i'].includes(r.kind)),'object ownership or kind');
  for(const table of tables) {
    const scoped=table.schema==='public' && tenantTables.includes(table.name);
    requireSafe(aclMatches(table.acl,migrator,scoped?{[runtime]:['SELECT']}:{}) && !table.columnAcl,'table or column ACL');
    requireSafe(!scoped || (table.rls && table.force),'FORCE RLS');
  }
  requireSafe(s.policies.length===tenantTables.length*2,'policy count');
  for(const table of tenantTables) {
    const admin=s.policies.find(p=>p.table===table && p.name==='migration_access');
    const read=s.policies.find(p=>p.table===table && p.name==='runtime_read');
    requireSafe(admin?.command==='*' && admin.permissive && admin.roles.length===1 && admin.roles[0]===migrator && admin.using==='true' && admin.check==='true','maintenance policy');
    requireSafe(read?.command==='r' && read.permissive && read.roles.length===1 && read.roles[0]===runtime && read.check===null && normal(read.using)===normal(readExpressions[table]!),'runtime policy');
  }
  requireSafe(s.functions.length===3,'function allowlist');
  const signatures:Record<string,string>={resolve_context:'text, uuid',can_access:'uuid, uuid, uuid',is_owner:'uuid'};
  for(const f of s.functions) requireSafe(f.schema==='auth' && f.owner===migrator && f.definer && f.language==='sql' && f.volatility==='s' && f.args===signatures[f.name] && JSON.stringify(f.settings)===JSON.stringify(['search_path=pg_catalog']) && createHash('sha256').update(f.body).digest('hex')===functionHashes[f.name] && aclMatches(f.acl,migrator,{[runtime]:['EXECUTE']}) && f.executable,'function definition or ACL');
  // Provisioning accepts the exact immutable legacy baseline for the forward migration.
  // Readiness never accepts the legacy default privilege state.
  requireSafe((mode==='provision' && allowLegacyDefaults && s.defaults.length===0) || (s.defaults.length===1 && s.defaults[0]?.schema==='*' && s.defaults[0]?.kind==='f' && aclMatches(s.defaults[0].acl,migrator,{})),'function default ACL');
  return 'schema';
}
export async function assertDatabaseSecurity(db: Kysely<Database>, mode:'provision'|'ready', expectedAdmin?:string) {
  // Fixed search_path also makes catalog policy deparsing reproducible across callers.
  return db.transaction().setIsolationLevel('repeatable read').execute(async trx=>{
    await sql`set local search_path = pg_catalog`.execute(trx);
    return validateSecurity(await inspectSecurity(trx),mode,expectedAdmin);
  });
}
