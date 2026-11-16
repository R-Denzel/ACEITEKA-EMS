import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

export default function Messages() {
  const { user } = useAuth();
  const school = user.userType === 'SCHOOL';
  const [items, setItems] = useState(null);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState({ schoolId: '', subject: '', body: '' });
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = () => api(school ? '/school-portal/messages' : '/messages').then((d) => setItems(d.items)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    if (!school) api('/schools?pageSize=100').then((d) => setSchools(d.items || [])).catch(() => {});
  }, []);

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
  const incoming = (m) => (school ? !m.fromSchool : m.fromSchool);

  return (
    <>
      <PageHeader title="Messages" description={school ? 'Send a message to ACEITEKA and read replies.' : 'Messages to and from individual schools.'} />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {done && <p role="status" className="mb-3 text-teal">{done}</p>}
      <form onSubmit={send} className="card mb-6 space-y-3">
        {!school && (
          <label className="block text-sm font-medium">School
            <select className="field mt-1" value={form.schoolId} onChange={(e) => setForm({ ...form, schoolId: e.target.value })} required><option value="">Choose a school</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        )}
        <label className="block text-sm font-medium">Subject<input className="field mt-1" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></label>
        <label className="block text-sm font-medium">Message<textarea className="field mt-1" rows="3" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} required /></label>
        <button className="btn-primary">{school ? 'Send to ACEITEKA' : 'Send to school'}</button>
      </form>
      <div className="space-y-3">
        {items?.map((m) => (
          <article key={m.id} className={`card ${incoming(m) && !m.readAt ? 'border-teal' : ''}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold text-navy">{m.subject}</h2>
              <span className="text-xs text-slate">{incoming(m) ? 'Received' : 'Sent'}{!school && m.schoolName ? `, ${m.schoolName}` : ''}: {new Date(m.createdAt).toLocaleString()}</span>
            </div>
            <p className="mt-2 whitespace-pre-line text-sm">{m.body}</p>
            {incoming(m) && !m.readAt && <button className="btn-ghost mt-2" onClick={() => markRead(m)}>Mark as read</button>}
          </article>))}
        {items?.length === 0 && <div className="card text-slate">No messages yet.</div>}
      </div>
    </>
  );
}
