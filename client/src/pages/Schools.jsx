import { useEffect, useMemo, useState } from 'react';
import { Building2, MapPin, Plus, Search } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

export default function Schools() {
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  const [centres, setCentres] = useState([]);
  const [centreForm, setCentreForm] = useState(null);
  const [edit, setEdit] = useState(null);

  const loadCentres = () => api('/centres').then((d) => setCentres(d.items)).catch(() => {});
  const load = () => api(`/schools?q=${encodeURIComponent(q)}&page=${page}&pageSize=10`).then(setData).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [q, page]);
  useEffect(() => { loadCentres(); }, []);

  const overview = useMemo(() => {
    const active = data?.items.filter((s) => s.isActive).length || 0;
    const inactive = (data?.items.length || 0) - active;
    return { total: data?.total || 0, active, inactive, centres: centres.length };
  }, [data, centres]);

  async function save(e) {
    e.preventDefault(); setFieldErrors({}); setError('');
    try { await api('/schools', { method: 'POST', body: form }); setForm(null); load(); }
    catch (err) { setFieldErrors(err.fields || {}); setError(err.fields ? '' : err.message); }
  }
  async function saveEdit(e) {
    e.preventDefault(); setError('');
    try {
      await api(`/schools/${edit.id}`, { method: 'PATCH', body: { name: edit.name, email: edit.email || undefined, phone: edit.phone || undefined, address: edit.address || undefined, centreId: edit.centreId || null, isActive: edit.isActive } });
      setEdit(null); load(); loadCentres();
    } catch (err) { setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message); }
  }
  async function saveCentre(e) {
    e.preventDefault(); setFieldErrors({}); setError('');
    try { await api('/centres', { method: 'POST', body: { ...centreForm, address: centreForm.address || undefined } }); setCentreForm(null); loadCentres(); }
    catch (err) { setFieldErrors(err.fields || {}); setError(err.fields ? '' : err.message); }
  }

  return (
    <>
      <PageHeader title="Schools and Centres" description="See the schools that take part in ACEITEKA examinations and the centres where they sit them.">
        {can('schools.create') && <button className="btn-primary" onClick={() => setForm({ code: '', name: '', email: '' })}><Plus size={16} /> Add a school</button>}
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="card"><div className="flex items-center gap-2 text-slate"><Building2 size={16} /> Total schools</div><div className="mt-2 text-3xl font-bold text-navy">{overview.total}</div></div>
        <div className="card"><div className="flex items-center gap-2 text-slate"><Building2 size={16} /> Active</div><div className="mt-2 text-3xl font-bold text-navy">{overview.active}</div></div>
        <div className="card"><div className="flex items-center gap-2 text-slate"><MapPin size={16} /> Centres</div><div className="mt-2 text-3xl font-bold text-navy">{overview.centres}</div></div>
        <div className="card"><div className="flex items-center gap-2 text-slate"><Building2 size={16} /> Inactive</div><div className="mt-2 text-3xl font-bold text-navy">{overview.inactive}</div></div>
      </div>

      {form && (
        <form onSubmit={save} className="card mb-6 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">School code *<input className="field mt-1" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="For example SCH003" />
            <span className="text-xs text-red-700">{fieldErrors.code}</span></label>
          <label className="text-sm font-medium">School name *<input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            <span className="text-xs text-red-700">{fieldErrors.name}</span></label>
          <label className="text-sm font-medium">School email<input className="field mt-1" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            <span className="text-xs text-red-700">{fieldErrors.email}</span></label>
          <div className="flex gap-2 sm:col-span-3"><button className="btn-primary">Save school</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      {edit && (
        <form onSubmit={saveEdit} className="card mb-6 grid gap-4 sm:grid-cols-3">
          <h2 className="font-semibold text-navy sm:col-span-3">Edit {edit.code}</h2>
          <label className="text-sm font-medium">School name<input className="field mt-1" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required /></label>
          <label className="text-sm font-medium">School email<input className="field mt-1" type="email" value={edit.email || ''} onChange={(e) => setEdit({ ...edit, email: e.target.value })} /></label>
          <label className="text-sm font-medium">Phone<input className="field mt-1" value={edit.phone || ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></label>
          <label className="text-sm font-medium">Address<input className="field mt-1" value={edit.address || ''} onChange={(e) => setEdit({ ...edit, address: e.target.value })} /></label>
          <label className="text-sm font-medium">Examination centre<select className="field mt-1" value={edit.centreId || ''} onChange={(e) => setEdit({ ...edit, centreId: e.target.value })}><option value="">No centre</option>{centres.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="flex items-center gap-2 pt-6 text-sm font-medium"><input type="checkbox" checked={edit.isActive} onChange={(e) => setEdit({ ...edit, isActive: e.target.checked })} /> School is active</label>
          <div className="flex gap-2 sm:col-span-3"><button className="btn-primary">Save changes</button><button type="button" className="btn-ghost" onClick={() => setEdit(null)}>Cancel</button></div>
        </form>
      )}
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full max-w-sm">
          <Search size={16} className="absolute left-3 top-3 text-slate" />
          <input className="field pl-9" placeholder="Search by school name or code" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
        </label>
        <div className="text-sm text-slate">{data ? `${data.total} schools` : 'Loading…'}</div>
      </div>

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Code</th><th className="p-3">School</th><th className="p-3">Centre</th><th className="p-3">Status</th>{can('schools.update') && <th className="p-3"></th>}</tr></thead>
          <tbody>
            {data?.items.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono">{s.code}</td><td className="p-3">{s.name}</td><td className="p-3">{s.centre?.name || '—'}</td>
                <td className="p-3">{s.isActive ? 'Active' : 'Switched off'}</td>
                {can('schools.update') && <td className="p-3"><button className="btn-ghost" onClick={() => setEdit({ ...s })}>Edit</button></td>}
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No schools found. Try a different search, or add a school.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="mt-4 flex items-center justify-between text-sm text-slate">
          <span>Page {page}</span>
          <div className="flex gap-2">
            <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="btn-ghost" disabled={page * 10 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}

      <div className="mb-2 mt-10 flex items-center justify-between">
        <h2 className="font-semibold text-navy">Examination centres</h2>
        {can('schools.create') && <button className="btn-primary" onClick={() => setCentreForm({ code: '', name: '', address: '' })}>Add a centre</button>}
      </div>
      {centreForm && (
        <form onSubmit={saveCentre} className="card mb-4 grid gap-4 sm:grid-cols-3">
          <label className="text-sm font-medium">Centre code *<input className="field mt-1" value={centreForm.code} onChange={(e) => setCentreForm({ ...centreForm, code: e.target.value })} placeholder="For example C003" /><span className="text-xs text-red-700">{fieldErrors.code}</span></label>
          <label className="text-sm font-medium">Centre name *<input className="field mt-1" value={centreForm.name} onChange={(e) => setCentreForm({ ...centreForm, name: e.target.value })} /><span className="text-xs text-red-700">{fieldErrors.name}</span></label>
          <label className="text-sm font-medium">Address<input className="field mt-1" value={centreForm.address || ''} onChange={(e) => setCentreForm({ ...centreForm, address: e.target.value })} /></label>
          <div className="flex gap-2 sm:col-span-3"><button className="btn-primary">Save centre</button><button type="button" className="btn-ghost" onClick={() => setCentreForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Code</th><th className="p-3">Centre</th><th className="p-3">Schools</th><th className="p-3">Address</th></tr></thead>
          <tbody>
            {centres.map((c) => <tr key={c.id} className="border-b border-line last:border-0"><td className="p-3 font-mono">{c.code}</td><td className="p-3">{c.name}</td><td className="p-3">{c._count?.schools ?? 0}</td><td className="p-3">{c.address || '—'}</td></tr>)}
            {centres.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate">No centres yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
