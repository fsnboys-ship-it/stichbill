import { useEffect, useState } from 'react';
import { api } from '@stichbill/api-client';
type State = { api: string; database: string; checked: string | null; busy: boolean };
async function fetchHealth(signal: AbortSignal): Promise<State> {
  const requestSignal = AbortSignal.any([signal, AbortSignal.timeout(5000)]);
  const [live, ready] = await Promise.allSettled([
    api.GET('/api/v1/health', { signal: requestSignal }),
    api.GET('/api/v1/health/ready', { signal: requestSignal }),
  ]);
  return { api: live.status === 'fulfilled' && live.value.data?.status === 'ok' ? 'Connected' : 'Unavailable',
    database: ready.status === 'fulfilled' && ready.value.data?.database === 'up' ? 'Connected' : 'Unavailable',
    checked: new Date().toLocaleTimeString(), busy: false };
}
export function App() {
  const [state, setState] = useState<State>({ api: 'Checking…', database: 'Checking…', checked: null, busy: true });
  useEffect(() => {
    const controller = new AbortController();
    void fetchHealth(controller.signal).then(result => { if (!controller.signal.aborted) setState(result); });
    return () => controller.abort();
  }, []);
  function refresh() {
    setState(s => ({ ...s, busy: true }));
    void fetchHealth(new AbortController().signal).then(setState);
  }
  return <main className="min-h-screen bg-slate-50 px-6 py-16 text-slate-900 sm:py-24">
    <div className="mx-auto max-w-xl">
      <p className="text-xs font-bold tracking-[0.24em] text-indigo-700">STICH BILL</p>
      <h1 className="mt-5 text-3xl font-semibold tracking-tight">Development foundation</h1>
      <p className="mt-3 text-base leading-7 text-slate-600">The workspace is ready for the next phase. Check the API and local database connection below.</p>
      <section aria-label="Service status" aria-live="polite" aria-busy={state.busy} className="mt-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="space-y-5">
          <div className="flex justify-between gap-4"><dt>API</dt><dd data-testid="api-status" className="font-semibold">{state.api}</dd></div>
          <div className="flex justify-between gap-4"><dt>PostgreSQL</dt><dd data-testid="db-status" className="font-semibold">{state.database}</dd></div>
        </dl>
        <p className="mt-6 text-sm text-slate-500">{state.checked ? `Last checked at ${state.checked}` : 'Contacting services…'}</p>
        <button disabled={state.busy} onClick={refresh} className="mt-5 rounded-lg bg-indigo-700 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-800 disabled:opacity-50">{state.busy ? 'Checking…' : 'Check again'}</button>
      </section>
      <p className="mt-6 text-sm leading-6 text-slate-500">Local development · Task 002</p>
    </div>
  </main>;
}
