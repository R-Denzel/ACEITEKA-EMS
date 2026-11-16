import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

export default function AssignExaminers() {
  const { can } = useAuth();
  const canAssign = can('examiners.assign');
  const [profiles, setProfiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ profileId: '', sessionId: '', subjectCode: '', role: 'Examiner' });
  const [error, setError] = useState('');
  const loadAssignments = () => api('/examiner-appointments').then((d) => setItems(d.items));
  useEffect(() => {
    api('/examiner-profiles').then((d) => setProfiles(d.items));
    api('/sessions').then((d) => { setSessions(d.items); if (d.items[0]) setForm((f) => ({ ...f, sessionId: d.items[0].id })); });
    loadAssignments().catch((e) => setError(e.message));
  }, []);
  const profile = profiles.find((p) => p.id === form.profileId);
  const sessionName = (id) => { const s = sessions.find((x) => x.id === id); return s ? `${s.name} ${s.year}` : ''; };

  async function assign(e) {
    e.preventDefault(); setError('');
    try { await api('/examiner-appointments', { method: 'POST', body: form }); await loadAssignments(); } catch (err) { setError(err.message); }
  }
  async function remove(id) {
    if (!confirm('Remove this assignment?')) return;
    try { await api(`/examiner-appointments/${id}`, { method: 'DELETE' }); await loadAssignments(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <PageHeader title="Assign Examiners" description="Choose which verified examiners will mark which subjects. Only examiners approved from school recommendations appear here." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {canAssign && (
        <form onSubmit={assign} className="card mb-6 grid gap-4 sm:grid-cols-4">
          <label className="text-sm font-medium sm:col-span-2">Examiner
            <select className="field mt-1" value={form.profileId} onChange={(e) => setForm({ ...form, profileId: e.target.value, subjectCode: '' })} required>
              <option value="">Choose an examiner</option>{profiles.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}</select></label>
          <label className="text-sm font-medium">Subject
            <select className="field mt-1" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value })} required>
              <option value="">Choose</option>{profile?.subjectCodes.map((c) => <option key={c}>{c}</option>)}</select></label>
          <label className="text-sm font-medium">Examination session
            <select className="field mt-1" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select></label>
          <div className="sm:col-span-4"><button className="btn-primary">Assign examiner</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Examiner</th><th className="p-3">Subject</th><th className="p-3">Session</th><th className="p-3">Role</th><th className="p-3"></th></tr></thead>
          <tbody>
            {items.map((a) => (<tr key={a.id} className="border-b border-line last:border-0"><td className="p-3">{a.profile.fullName}</td><td className="p-3 font-mono text-xs">{a.subjectCode}</td><td className="p-3">{sessionName(a.sessionId)}</td><td className="p-3">{a.role}</td><td className="p-3">{canAssign && <button className="btn-ghost" onClick={() => remove(a.id)}>Remove</button>}</td></tr>))}
            {items.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No examiners are assigned yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
