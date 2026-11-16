import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

export default function Announcements() {
  const { user, can } = useAuth();
  const school = user.userType === 'SCHOOL';
  const [items, setItems] = useState(null);
  const [form, setForm] = useState({ title: '', body: '' });
  const [error, setError] = useState('');
  const base = school ? '/school-portal/announcements' : '/announcements';
  const load = () => api(base).then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function send(e) {
    e.preventDefault(); setError('');
    try { await api('/announcements', { method: 'POST', body: form }); setForm({ title: '', body: '' }); load(); } catch (err) { setError(err.message); }
  }
  async function remove(id) {
    if (!confirm('Remove this announcement?')) return;
    try { await api(`/announcements/${id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <PageHeader title="Announcements" description={school ? 'Notices from ACEITEKA to all schools.' : 'Notices that every school will see in its portal.'} />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {!school && can('announcements.manage') && (
        <form onSubmit={send} className="card mb-6 space-y-3">
          <label className="block text-sm font-medium">Title<input className="field mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
          <label className="block text-sm font-medium">Announcement<textarea className="field mt-1" rows="4" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
          <button className="btn-primary">Send to all schools</button>
        </form>
      )}
      <div className="space-y-3">
        {items?.map((a) => (
          <article key={a.id} className="card">
            <div className="flex items-start justify-between gap-3"><h2 className="font-semibold text-navy">{a.title}</h2>
              {!school && can('announcements.manage') && <button className="text-sm text-slate underline" onClick={() => remove(a.id)}>Remove</button>}</div>
            <p className="text-xs text-slate">{new Date(a.createdAt).toLocaleString()}</p>
            <p className="mt-2 whitespace-pre-line text-sm">{a.body}</p>
          </article>))}
        {items?.length === 0 && <div className="card text-slate">No announcements yet.</div>}
      </div>
    </>
  );
}
