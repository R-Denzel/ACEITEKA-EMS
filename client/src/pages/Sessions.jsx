import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge, { STATUS_LABELS } from '../components/StatusBadge';

const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : '');

export default function Sessions() {
  const { can } = useAuth();
  const [items, setItems] = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [form, setForm] = useState(null);
  const [errs, setErrs] = useState({});
  const [error, setError] = useState('');
  const [picking, setPicking] = useState(null);

  const load = () => Promise.all([api('/sessions'), api('/subjects')]).then(([s, j]) => { setItems(s.items); setSubjects(j.items); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function save(e) {
    e.preventDefault(); setErrs({}); setError('');
    const body = { name: form.name, year: Number(form.year), registrationOpens: form.registrationOpens || null, registrationCloses: form.registrationCloses || null };
    try { await api(form.id ? `/sessions/${form.id}` : '/sessions', { method: form.id ? 'PATCH' : 'POST', body }); setForm(null); load(); } catch (err) { setErrs(err.fields || {}); if (!err.fields) setError(err.message); }
  }
  const setStatus = async (id, status) => { try { await api(`/sessions/${id}`, { method: 'PATCH', body: { status } }); load(); } catch (e) { setError(e.message); } };
  async function saveSubjects() {
    try { await api(`/sessions/${picking.id}/subjects`, { method: 'PUT', body: { subjectIds: picking.ids } }); setPicking(null); load(); } catch (e) { setError(e.message); }
  }

  return (
    <>
      <PageHeader title="Examination Sessions" description="Each session is one round of examinations. Schools can only send student entries while registration is open.">
        {can('sessions.manage') && <button className="btn-primary" onClick={() => setForm({ name: '', year: new Date().getFullYear(), registrationOpens: '', registrationCloses: '' })}>Create a session</button>}
      </PageHeader>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {form && (
        <form onSubmit={save} className="card mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="text-sm font-medium">Session name *<input className="field mt-1" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="End of Year Examinations" /><span className="text-xs text-red-700">{errs.name}</span></label>
          <label className="text-sm font-medium">Year *<input className="field mt-1" type="number" value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /><span className="text-xs text-red-700">{errs.year}</span></label>
          <label className="text-sm font-medium">Registration opens<input className="field mt-1" type="date" value={form.registrationOpens} onChange={(e) => setForm({ ...form, registrationOpens: e.target.value })} /></label>
          <label className="text-sm font-medium">Registration closes<input className="field mt-1" type="date" value={form.registrationCloses} onChange={(e) => setForm({ ...form, registrationCloses: e.target.value })} /><span className="text-xs text-red-700">{errs.registrationCloses}</span></label>
          <div className="flex gap-2 sm:col-span-2 lg:col-span-4"><button className="btn-primary">Save session</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      {picking && (
        <div className="card mb-6">
          <h2 className="font-semibold text-navy">Subjects offered in this session</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {subjects.filter((s) => s.isActive).map((s) => (
              <label key={s.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={picking.ids.includes(s.id)} onChange={(e) => setPicking({ ...picking, ids: e.target.checked ? [...picking.ids, s.id] : picking.ids.filter((x) => x !== s.id) })} />
                <span className="font-mono">{s.code}</span> {s.name}
              </label>
            ))}
          </div>
          <div className="mt-4 flex gap-2"><button className="btn-primary" onClick={saveSubjects}>Save subjects</button><button className="btn-ghost" onClick={() => setPicking(null)}>Cancel</button></div>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Session</th><th className="p-3">Status</th><th className="p-3">Registration</th><th className="p-3">Subjects</th>{can('sessions.manage') && <th className="p-3">Actions</th>}</tr></thead>
          <tbody>
            {items?.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0">
                <td className="p-3 font-medium">{s.name} <span className="font-mono text-slate">{s.year}</span></td>
                <td className="p-3"><StatusBadge status={s.status} /></td>
                <td className="p-3 text-slate">{d(s.registrationOpens) || '—'} to {d(s.registrationCloses) || '—'}</td>
                <td className="p-3">{s.subjects.length}</td>
                {can('sessions.manage') && (
                  <td className="flex flex-wrap gap-2 p-3">
                    <select className="field w-48" value={s.status} onChange={(e) => setStatus(s.id, e.target.value)} aria-label="Change status">
                      {Object.entries(STATUS_LABELS).filter(([k]) => ['PLANNED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'EXAM_ONGOING', 'RESULTS_PROCESSING', 'COMPLETED'].includes(k)).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                    <button className="btn-ghost" onClick={() => setForm({ id: s.id, name: s.name, year: s.year, registrationOpens: d(s.registrationOpens), registrationCloses: d(s.registrationCloses) })}>Edit</button>
                    <button className="btn-ghost" onClick={() => setPicking({ id: s.id, ids: s.subjects.map((x) => x.subjectId) })}>Choose subjects</button>
                  </td>
                )}
              </tr>
            ))}
            {items?.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No sessions yet. Create one to start receiving student entries.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
