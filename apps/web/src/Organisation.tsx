import { useEffect, useState, type FormEvent } from 'react';
type Location = {id:string;shop_id?:string;code:string;name:string;address:string;contact?:string;active:boolean};
type Scope = {shopId:string;branchId:string|null};
type Staff = {id:string;name:string;role:'owner'|'cashier';status:string;scopes:Scope[]};
type Data = {owner:boolean;shops:Location[];branches:Location[];staff:Staff[]};
export function Organisation({tenant,csrf}:{tenant:string;csrf:string}) {
  const [data,setData]=useState<Data|null>(null),[message,setMessage]=useState(''),[busy,setBusy]=useState(false);
  const [location,setLocation]=useState<Location|null>(null),[kind,setKind]=useState<'shop'|'branch'>('shop');
  const [staff,setStaff]=useState<Staff|null>(null),[scopes,setScopes]=useState<Scope[]>([]);
  async function refresh(signal?:AbortSignal) {
    const response=await fetch(`/api/v1/auth/organisation/${tenant}`,{signal});
    if(!response.ok) throw new Error('Access unavailable. Sign in again or contact your owner.');
    setData(await response.json() as Data);
  }
  useEffect(()=>{
    const controller=new AbortController();
    void fetch(`/api/v1/auth/organisation/${tenant}`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error('Access unavailable. Sign in again.');
      setData(await response.json() as Data);
    }).catch(error=>{if(!controller.signal.aborted)setMessage(String(error));});
    return ()=>controller.abort();
  },[tenant]);
  async function save(event:FormEvent<HTMLFormElement>,operation:'location'|'staff') {
    event.preventDefault();const form=event.currentTarget;const fields=Object.fromEntries(new FormData(form));setBusy(true);setMessage('');
    const body=operation==='location'?{kind,id:location?.id??null,shopId:kind==='branch'?fields.shopId:null,code:fields.code,name:fields.name,address:fields.address,contact:fields.contact??'',active:fields.active==='on'}:
      {id:staff?.id??null,...(!staff?{email:fields.email}:{}),name:fields.name,role:fields.role,active:fields.active==='on',scopes};
    try {
      const response=await fetch(`/api/v1/auth/organisation/${tenant}/${operation}`,{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify(body)});
      if(!response.ok)throw new Error((await response.json() as {message:string}).message);
      setLocation(null);setStaff(null);setScopes([]);form.reset();await refresh();setMessage('Saved. Staff access changes require the affected person to sign in again.');
    }catch(error){setMessage(error instanceof Error?error.message:'Unable to save. Please try again.');}finally{setBusy(false);}
  }
  const input='block w-full min-h-11 rounded border border-slate-300 px-3 py-2 mt-1';
  const button='min-h-11 rounded bg-indigo-700 px-3 py-2 text-white disabled:opacity-50';
  return <section className="mt-6 space-y-5" aria-label="Shops, branches and staff" aria-busy={busy}>
    <h3 className="text-xl font-semibold">Shops, branches and staff</h3>
    {message&&<p role="status">{message}</p>}
    {!data?<p>Loading your access…</p>:<>
      <h4 className="font-semibold">Shops</h4>{!data.shops.length&&<p>No shops yet.</p>}
      {data.shops.map(item=><div key={item.id} className="rounded border p-3"><p>{item.name} · {item.code} · {item.active?'Active':'Inactive'}</p><p>{item.address}</p>{data.owner&&<button type="button" className={button} disabled={busy} onClick={()=>{setKind('shop');setLocation(item);}}>Edit shop {item.code}</button>}</div>)}
      <h4 className="font-semibold">Branches</h4>{!data.branches.length&&<p>No branches yet.</p>}
      {data.branches.map(item=><div key={item.id} className="rounded border p-3"><p>{item.name} · {data.shops.find(s=>s.id===item.shop_id)?.name} · {item.active?'Active':'Inactive'}</p><p>{item.address}</p>{data.owner&&<button type="button" className={button} disabled={busy} onClick={()=>{setKind('branch');setLocation(item);}}>Edit branch {item.code}</button>}</div>)}
      {data.owner&&<>
        <div className="flex flex-wrap gap-2"><button type="button" className={button} onClick={()=>{setKind('shop');setLocation(null);}}>New shop</button><button type="button" className={button} onClick={()=>{setKind('branch');setLocation(null);}}>New branch</button></div>
        <form key={`${kind}-${location?.id??'new'}`} onSubmit={e=>void save(e,'location')} className="space-y-3 rounded border p-3">
          <h4>{location?'Edit':'Create'} {kind}</h4>
          <fieldset disabled={busy} className="space-y-3">
            {kind==='branch'&&<label className="block">Shop<select name="shopId" className={input} defaultValue={location?.shop_id} required>{data.shops.filter(s=>!location||s.id===location.shop_id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
            <label className="block">Location code<input className={input} name="code" required maxLength={40} defaultValue={location?.code}/></label>
            <label className="block">Location name<input className={input} name="name" required maxLength={160} defaultValue={location?.name}/></label>
            <label className="block">Address<textarea className={input} name="address" required maxLength={500} defaultValue={location?.address}/></label>
            {kind==='shop'&&<label className="block">Business contact<input className={input} name="contact" required maxLength={80} defaultValue={location?.contact}/></label>}
            <label className="block"><input type="checkbox" name="active" defaultChecked={location?.active??true}/> Active location</label>
            <button className={button}>Save {kind}</button>
          </fieldset>
        </form>
        <h4 className="font-semibold">Staff</h4>{!data.staff.length&&<p>No staff added.</p>}
        {data.staff.map(item=><div key={item.id} className="rounded border p-3"><p>{item.name} · {item.role} · {item.status}</p><button type="button" className={button} disabled={busy} onClick={()=>{setStaff(item);setScopes(item.scopes);}}>Edit access for {item.name}</button></div>)}
        <button type="button" className={button} onClick={()=>{setStaff(null);setScopes([]);}}>Add staff</button>
        <form key={staff?.id??'new-staff'} onSubmit={e=>void save(e,'staff')} className="space-y-3 rounded border p-3">
          <h4>{staff?'Change staff access':'Add registered staff'}</h4><p className="text-sm">Ask staff to create an account first. They do not need to create a business. After access is saved, they must sign in again.</p>
          <fieldset disabled={busy} className="space-y-3">
            {!staff&&<label className="block">Staff email<input className={input} name="email" type="email" required maxLength={254}/></label>}
            <label className="block">Staff name<input className={input} name="name" required maxLength={160} defaultValue={staff?.name}/></label>
            <label className="block">Role<select className={input} name="role" defaultValue={staff?.role??'cashier'}><option value="cashier">Cashier</option><option value="owner">Owner — all shops and branches</option></select></label>
            <label className="block"><input type="checkbox" name="active" defaultChecked={staff?staff.status==='active':true}/> Active staff access</label>
            <p>Cashier assignments (choose at least one):</p>
            {data.shops.filter(s=>s.active).flatMap(shop=>[{shopId:shop.id,branchId:null,label:`${shop.name}: all branches`},...data.branches.filter(b=>b.shop_id===shop.id&&b.active).map(b=>({shopId:shop.id,branchId:b.id,label:`${shop.name}: ${b.name}`}))]).map(option=>{
              const selected=scopes.some(s=>s.shopId===option.shopId&&s.branchId===option.branchId);
              return <label key={option.shopId+(option.branchId??'all')} className="block py-2"><input type="checkbox" checked={selected} onChange={()=>setScopes(old=>selected?old.filter(s=>!(s.shopId===option.shopId&&s.branchId===option.branchId)):[...old,{shopId:option.shopId,branchId:option.branchId}])}/> {option.label}</label>;
            })}
            <button className={button}>Save staff access</button>
          </fieldset>
        </form>
      </>}
    </>}
  </section>;
}
