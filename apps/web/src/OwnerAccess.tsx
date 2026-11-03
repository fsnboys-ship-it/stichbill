import { Catalogue } from './Catalogue';
import { Organisation } from './Organisation';
import { useEffect, useState, type FormEvent } from 'react';
type View = 'login' | 'register' | 'recover' | 'reset' | 'setup' | 'business';
type Business = { id: string; name: string };
export function OwnerAccess() {
  const [view, setView] = useState<View>(() => location.hash.startsWith('#reset=') ? 'reset' : 'login');
  const [resetToken, setResetToken] = useState(() => location.hash.startsWith('#reset=') ? location.hash.slice(7) : '');
  const [csrf, setCsrf] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  useEffect(() => {
    function receiveResetLink() {
      if (location.hash.startsWith('#reset=')) {
        setResetToken(location.hash.slice(7)); setView('reset'); setMessage('');
        history.replaceState(null, '', location.pathname);
      }
    }
    window.addEventListener('hashchange', receiveResetLink);
    const recovering=location.hash.startsWith('#reset=');
    if (location.hash.startsWith('#reset=')) history.replaceState(null, '', location.pathname);
    const controller = new AbortController();
    void fetch('/api/v1/auth/csrf', { signal: controller.signal }).then(r => {
      if (!r.ok) throw new Error();
      return r.json() as Promise<{csrf: string}>;
    }).then(async data => {
      if(!recovering){const response=await fetch('/api/v1/auth/session',{signal:controller.signal});if(response.ok){const session=await response.json() as {businesses:Business[]};if(!controller.signal.aborted){setBusinesses(session.businesses);setView(session.businesses.length?'business':'setup');}}}
      if(!controller.signal.aborted)setCsrf(data.csrf);
    }).catch(() => {
      if (!controller.signal.aborted) setMessage('Cannot connect. Please refresh and try again.');
    });
    return () => { controller.abort(); window.removeEventListener('hashchange', receiveResetLink); };
  }, []);
  async function loadSession() {
    const response = await fetch('/api/v1/auth/session');
    if (!response.ok) throw new Error('Please sign in to continue.');
    const data = await response.json() as {businesses: Business[]};
    setBusinesses(data.businesses);
    setView(data.businesses.length ? 'business' : 'setup');
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = Object.fromEntries(new FormData(event.currentTarget));
    if (view === 'reset') fields.token = resetToken;
    setBusy(true); setMessage('');
    try {
      const action = view === 'setup' ? 'onboard' : view === 'business' ? 'logout' : view;
      const response = await fetch(`/api/v1/auth/${action}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf }, body: JSON.stringify(fields),
      });
      const data = await response.json() as {csrf?: string; message?: string};
      if (!response.ok) throw new Error(response.status === 429 ? 'Too many attempts. Please try again in 15 minutes.' : data.message ?? 'Unable to continue. Please try again.');
      if (data.csrf) setCsrf(data.csrf);
      if (['login', 'register', 'setup'].includes(view)) await loadSession();
      else if (view === 'business' || view === 'reset') {
        setView('login');
        const refreshed = await fetch('/api/v1/auth/csrf');
        const value = await refreshed.json() as {csrf: string}; setCsrf(value.csrf);
        setMessage(data.message ?? 'Signed out.');
      } else setMessage(data.message ?? 'Request received.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Cannot connect. Please try again.'); }
    finally { setBusy(false); }
  }
  function change(next: View) { setView(next); setMessage(''); }
  const titles: Record<View,string> = { login: 'Welcome back', register: 'Create your owner account', recover: 'Recover your account', reset: 'Choose a new password', setup: 'Set up your business', business: 'Your business' };
  const inputClass = 'mt-2 block min-h-12 w-full rounded-lg border border-slate-300 bg-white px-3 text-base';
  return <section aria-labelledby="owner-title" className="mb-10 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
    <h2 id="owner-title" className="text-2xl font-semibold">{titles[view]}</h2>
    <p className="mt-2 text-sm leading-6 text-slate-600">{view === 'setup' ? 'Start with your business name and your name. Currency is INR and the timezone is India.' : 'Secure access for your shop. Use your own email and a password of at least 12 characters.'}</p>
    <form onSubmit={event => void submit(event)} className="mt-6 space-y-5" aria-busy={busy}>
      {['login', 'register', 'recover'].includes(view) && <label className="block">Email address<input className={inputClass} name="email" type="email" autoComplete="email" maxLength={254} required disabled={busy} /></label>}
      {['login', 'register', 'reset'].includes(view) && <label className="block">{view === 'reset' ? 'New password' : 'Password'}<input className={inputClass} name="password" type="password" autoComplete={view === 'login' ? 'current-password' : 'new-password'} minLength={12} maxLength={128} required disabled={busy} /></label>}
      {view === 'setup' && <>
        <label className="block">Business name<input className={inputClass} name="businessName" autoComplete="organization" maxLength={160} required disabled={busy} /></label>
        <label className="block">Your name<input className={inputClass} name="ownerName" autoComplete="name" maxLength={160} required disabled={busy} /></label>
      </>}
      {view === 'business' && <ul>{businesses.map(b => <li key={b.id} className="py-2 font-medium">{b.name}</li>)}</ul>}
      {message && <p role="status" className="rounded-lg bg-slate-100 p-3 text-sm leading-6">{message}</p>}
      <button disabled={busy || !csrf} className="min-h-12 w-full rounded-lg bg-indigo-700 px-4 py-3 font-semibold text-white disabled:opacity-50">{busy ? 'Please wait…' : ({login:'Sign in',register:'Create account',recover:'Send recovery instructions',reset:'Change password',setup:'Create business',business:'Sign out'})[view]}</button>
    </form>
    {view === 'business' && businesses.map(b => <div key={b.id}><Organisation tenant={b.id} csrf={csrf} /><Catalogue tenant={b.id} csrf={csrf}/></div>)}
    {['login', 'register', 'recover'].includes(view) && <nav aria-label="Account access" className="mt-4 flex flex-wrap gap-2">
      {view !== 'login' && <button disabled={busy} onClick={() => change('login')} className="min-h-11 px-2 text-indigo-700">Sign in</button>}
      {view !== 'register' && <button disabled={busy} onClick={() => change('register')} className="min-h-11 px-2 text-indigo-700">Create owner account</button>}
      {view !== 'recover' && <button disabled={busy} onClick={() => change('recover')} className="min-h-11 px-2 text-indigo-700">Forgot password?</button>}
    </nav>}
  </section>;
}
