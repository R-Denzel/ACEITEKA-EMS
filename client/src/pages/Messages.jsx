import { useEffect, useMemo, useState } from 'react';
import { Mail, Send, Inbox, CheckCheck } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

const VIEW_OPTIONS = { all: 'All', unread: 'Unread', sent: 'Sent', received: 'Received' };

export default function Messages() {
  const { user } = useAuth();
  const school = user.userType === 'SCHOOL';
  const [items, setItems] = useState([]);
  const [schools, setSchools] = useState([]);
  const [view, setView] = useState('all');
  const [form, setForm] = useState({ schoolId: '', subject: '', body: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  const load = () => api(school ? '/school-portal/messages' : '/messages').then((d) => setItems(d.items || [])).catch((e) => setError(e.message));

  useEffect(() => {
    load();
    if (!school) api('/schools?pageSize=100').then((d) => setSchools(d.items || [])).catch(() => {});
  }, []);

  const incoming = (m) => (school ? !m.fromSchool : m.fromSchool);
  const filtered = useMemo(() => {
    const list = items || [];
    switch (view) {
      case 'unread': return list.filter((m) => incoming(m) && !m.readAt);
      case 'sent': return list.filter((m) => !incoming(m));
      case 'received': return list.filter((m) => incoming(m));
      default: return list;
    }
  }, [items, view, school]);

  const summary = useMemo(() => ({ total: items.length, unread: items.filter((m) => incoming(m) && !m.readAt).length, sent: items.filter((m) => !incoming(m)).length }), [items, school]);

  async function send(e) {
    e.preventDefault(); setError(''); setDone('');
    try {
      await api(school ? '/school-portal/messages' : '/messages', { method: 'POST', body: form });
      setForm({ ...form, subject: '', body: '' }); setDone('Message sent.'); load();
    } catch (err) { setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message); }
  }
  async function markRead(m) {
    await api(school ? `/school-portal/messages/${m.id}/read` : `/messages/${m.id}/read`, { method: 'POST' }).catch(() => {});
    load();
  }

  return (
    <>
      <PageHeader title="Messages" description={school ? 'Send a message to ACEITEKA and read replies.' : 'Messages to and from individual schools.'} />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {done && <p role="status" className="mb-3 text-teal">{done}</p>}

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="card"><div className="flex items-center gap-2 text-slate"><Mail size={16} /> Total</div><div className="mt-2 text-3xl font-bold text-navy">{summary.total}</div></div>
        <div className="card"><div className="flex items-center gap-2 text-slate"><Inbox size={16} /> Unread</div><div className="mt-2 text-3xl font-bold text-navy">{summary.unread}</div></div>
        <div className="card"><div className="flex items-center gap-2 text-slate"><Send size={16} /> Sent</div><div className="mt-2 text-3xl font-bold text-navy">{summary.sent}</div></div>
      </div>

      <form onSubmit={send} className="card mb-6 space-y-4">
        {!school && (
          <label className="block text-sm font-medium">School
            <select className="field mt-1" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} required><option value="">Choose a school</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          </label>
        )}
        <label className="block text-sm font-medium">Subject<input className="field mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="For example: Student registration issue" required /></label>
        <label className="block text-sm font-medium">Message<textarea className="field mt-1" rows="4" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={school ? 'Write your message to ACEITEKA' : 'Write your reply to the school'} required /></label>
        <button className="btn-primary">{school ? 'Send to ACEITEKA' : 'Send to school'}</button>
      </form>

      <div className="mb-4 flex flex-wrap gap-2">
        {Object.entries(VIEW_OPTIONS).map(([key, label]) => (
          <button key={key} type="button" className={`rounded-full px-3 py-1.5 text-sm font-medium ${view === key ? 'bg-navy text-white' : 'bg-page text-slate'}`} onClick={() => setView(key)}>{label}</button>
        ))}
      </div>

      <div className="space-y-3">
        {filtered.map((m) => (
          <article key={m.id} className={`card ${incoming(m) && !m.readAt ? 'border-teal bg-teal/5' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${incoming(m) ? 'bg-blue-50 text-blue-700' : 'bg-slate-100 text-slate-700'}`}>{incoming(m) ? 'Received' : 'Sent'}</span>
                <h2 className="font-semibold text-navy">{m.subject}</h2>
              </div>
              <span className="text-xs text-slate">{!school && m.schoolName ? `${m.schoolName} • ` : ''}{new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm text-slate">{m.body}</p>
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs text-slate">{incoming(m) && m.readAt ? 'Read' : incoming(m) ? 'Unread' : 'Delivered'}</span>
              {incoming(m) && !m.readAt && <button className="btn-ghost" onClick={() => markRead(m)}><CheckCheck size={16} /> Mark as read</button>}
            </div>
          </article>
        ))}
        {filtered.length === 0 && <div className="card text-slate">No messages in this view yet.</div>}
      </div>
    </>
  );
}
