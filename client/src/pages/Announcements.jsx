import { useEffect, useState } from 'react';
import { Megaphone, Pin, Plus, Trash2 } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

const DEPARTMENTS = [
  ['administration', 'Administration'],
  ['registration', 'Registration'],
  ['examiner_management', 'Examiner management'],
  ['results', 'Results'],
  ['exam_setters', 'Examination setters'],
  ['printing', 'Printing'],
];

const AUDIENCE_LABELS = {
  GENERAL: 'All schools and staff',
  DEPARTMENT: 'Department',
  STAFF_DASHBOARD: 'Staff dashboard',
};

export default function Announcements() {
  const { user, can } = useAuth();
  const school = user.userType === 'SCHOOL';
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ title: '', body: '', audience: 'GENERAL', departmentKey: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const base = school ? '/school-portal/announcements' : '/announcements';
  const load = () => api(base).then((d) => setItems(d.items || [])).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  async function send(e) {
    e.preventDefault(); setError('');
    try {
      await api('/announcements', { method: 'POST', body: { ...form, departmentKey: form.audience === 'DEPARTMENT' ? form.departmentKey : undefined } });
      setForm({ title: '', body: '', audience: 'GENERAL', departmentKey: '' });
      setCreating(false);
      await load();
    } catch (err) { setError(err.message); }
  }
  async function remove(id) {
    if (!confirm('Remove this announcement?')) return;
    try { await api(`/announcements/${id}`, { method: 'DELETE' }); load(); } catch (err) { setError(err.message); }
  }

  return (
    <>
      <PageHeader title="Announcements" description={school ? 'General notices from ACEITEKA to all schools.' : 'Publish notices for all schools, a staff department, or the staff dashboard.'}>
        {!school && can('announcements.manage') && <button className="btn-primary" onClick={() => setCreating((value) => !value)}><Plus size={16} />{creating ? 'Close form' : 'Create announcement'}</button>}
      </PageHeader>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {!school && can('announcements.manage') && creating && (
        <form onSubmit={send} className="card mb-6 space-y-4">
          <div className="flex items-center gap-2 text-navy"><Megaphone size={18} /><span className="font-semibold">Create an announcement</span></div>
          <label className="block text-sm font-medium">Title<input className="field mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Example: Registration period extended" required /></label>
          <label className="block text-sm font-medium">Audience
            <select className="field mt-1" value={form.audience} onChange={(e) => setForm({ ...form, audience: e.target.value, departmentKey: '' })}>
              <option value="GENERAL">General — all staff and school portals</option>
              <option value="DEPARTMENT">Department — selected staff department</option>
              <option value="STAFF_DASHBOARD">Staff dashboard — internal staff only</option>
            </select>
          </label>
          {form.audience === 'DEPARTMENT' && (
            <label className="block text-sm font-medium">Department
              <select className="field mt-1" value={form.departmentKey} onChange={(e) => setForm({ ...form, departmentKey: e.target.value })} required>
                <option value="">Choose a department</option>
                {DEPARTMENTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
          )}
          <label className="block text-sm font-medium">Announcement<textarea className="field mt-1" rows="4" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder="Write the announcement" required /></label>
          <button className="btn-primary">Publish announcement</button>
        </form>
      )}
      <div className="space-y-3">
        {items.map((a) => (
          <article key={a.id} className="card">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-teal/10 px-2.5 py-1 text-[11px] font-semibold text-teal"><Pin size={12} className="inline" /> Notice</span>
                {!school && <span className="rounded-full bg-page px-2.5 py-1 text-[11px] font-semibold text-slate">
                  {a.audience === 'DEPARTMENT' ? `${DEPARTMENTS.find(([key]) => key === a.departmentKey)?.[1] || 'Department'} team` : AUDIENCE_LABELS[a.audience] || 'Announcement'}
                </span>}
                <h2 className="font-semibold text-navy">{a.title}</h2>
              </div>
              {!school && can('announcements.manage') && <button className="btn-ghost text-red-700" onClick={() => remove(a.id)}><Trash2 size={14} /> Remove</button>}
            </div>
            <p className="mt-2 text-xs text-slate">{new Date(a.createdAt).toLocaleString()}</p>
            <p className="mt-3 whitespace-pre-line text-sm text-slate">{a.body}</p>
          </article>
        ))}
        {items.length === 0 && <div className="card text-slate">No announcements yet.</div>}
      </div>
    </>
  );
}
