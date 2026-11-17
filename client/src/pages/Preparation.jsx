import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { BellRing, CalendarClock, CheckCircle2, Circle, Plus, UserRound } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

const dateValue = (value) => value ? new Date(value).toISOString().slice(0, 10) : '';
const STATUSES = [
  ['NOT_STARTED', 'Not started'],
  ['IN_PROGRESS', 'In progress'],
  ['COMPLETED', 'Completed'],
  ['BLOCKED', 'Blocked'],
];

export default function Preparation() {
  const { can } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [staff, setStaff] = useState([]);
  const [overview, setOverview] = useState(null);
  const [form, setForm] = useState(null);
  const [editing, setEditing] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadOverview = async (id = sessionId) => {
    if (!id) return;
    try { setOverview(await api(`/preparation/overview?sessionId=${encodeURIComponent(id)}`)); }
    catch (err) { setError(err.message); }
  };

  useEffect(() => {
    api('/preparation/sessions')
      .then(({ items }) => {
        setSessions(items);
        if (items[0]) setSessionId(items[0].id);
      })
      .catch((err) => setError(err.message));
    if (can('pipeline.manage')) api('/preparation/staff').then((d) => setStaff(d.items)).catch((err) => setError(err.message));
  }, []);
  useEffect(() => { if (sessionId) loadOverview(sessionId); }, [sessionId]);

  const schoolCounts = useMemo(() => {
    const schools = overview?.schools || [];
    return {
      total: schools.length,
      submitted: schools.filter((school) => school.submission).length,
      outstanding: schools.filter((school) => school.outstanding).length,
    };
  }, [overview]);
  const reminderCount = overview?.schools.filter((school) => school.reminderAvailable).length || 0;

  async function createTemplate() {
    setError(''); setNotice('');
    try {
      const result = await api('/preparation/milestones/template', { method: 'POST', body: { sessionId } });
      setNotice(`Added ${result.count} preparation milestones.`);
      await loadOverview();
    } catch (err) { setError(err.message); }
  }

  async function createMilestone(e) {
    e.preventDefault(); setError(''); setNotice('');
    try {
      await api('/preparation/milestones', {
        method: 'POST',
        body: { sessionId, title: form.title, description: form.description || undefined, dueAt: form.dueAt ? new Date(`${form.dueAt}T23:59:59`).toISOString() : null, assignedToId: form.assignedToId || null },
      });
      setForm(null);
      await loadOverview();
    } catch (err) { setError(err.message); }
  }

  async function updateMilestone(id, body) {
    setError('');
    try { await api(`/preparation/milestones/${id}`, { method: 'PATCH', body }); await loadOverview(); return true; }
    catch (err) { setError(err.message); return false; }
  }

  async function saveMilestone(e) {
    e.preventDefault();
    const body = {
      title: editing.title,
      description: editing.description || null,
      dueAt: editing.dueAt ? new Date(`${editing.dueAt}T23:59:59`).toISOString() : null,
      assignedToId: editing.assignedToId || null,
    };
    if (await updateMilestone(editing.id, body)) setEditing(null);
  }

  async function remindSchools() {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await api(`/preparation/${sessionId}/remind-missing`, { method: 'POST' });
      setNotice(result.message);
      await loadOverview();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Examination Preparation" description="Plan the work for each examination session, track school entries, and send reminders to schools that are still outstanding." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-3 text-teal">{notice}</p>}

      <div className="card mb-6">
        <label className="block max-w-xl text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} {session.year}</option>)}
          </select>
        </label>
      </div>

      {overview && (
        <>
          <div className="mb-6 grid gap-4 sm:grid-cols-3">
            <div className="card"><div className="text-sm text-slate">Active schools</div><div className="mt-2 text-3xl font-bold text-navy">{schoolCounts.total}</div></div>
            <div className="card"><div className="text-sm text-slate">Have submitted entries</div><div className="mt-2 text-3xl font-bold text-navy">{schoolCounts.submitted}</div></div>
            <div className="card"><div className="text-sm text-slate">Outstanding</div><div className="mt-2 text-3xl font-bold text-navy">{schoolCounts.outstanding}</div></div>
          </div>

          <section className="mb-8">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-navy">Preparation timetable</h2>
                <p className="text-sm text-slate">Milestones, owners, due dates, and progress for {overview.session.name} {overview.session.year}.</p>
              </div>
              <div className="flex gap-2">
                {can('pipeline.manage') && overview.milestones.length === 0 && <button className="btn-ghost" onClick={createTemplate}>Use milestone template</button>}
                {can('pipeline.manage') && <button className="btn-primary" onClick={() => setForm({ title: '', description: '', dueAt: '', assignedToId: '' })}><Plus size={16} /> Add milestone</button>}
              </div>
            </div>

            {form && (
              <form onSubmit={createMilestone} className="card mb-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium">Milestone title<input className="field mt-1" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></label>
                <label className="text-sm font-medium">Due date<input className="field mt-1" type="date" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} /></label>
                <label className="text-sm font-medium">Description<textarea className="field mt-1" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
                <label className="text-sm font-medium">Owner<select className="field mt-1" value={form.assignedToId} onChange={(e) => setForm({ ...form, assignedToId: e.target.value })}><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select></label>
                <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Save milestone</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
              </form>
            )}

            <div className="space-y-3">
              {overview.milestones.map((milestone) => (
                <article key={milestone.id} className="card">
                  {editing?.id === milestone.id ? (
                    <form onSubmit={saveMilestone} className="grid gap-3 sm:grid-cols-2">
                      <label className="text-sm font-medium">Milestone title<input className="field mt-1" value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} required /></label>
                      <label className="text-sm font-medium">Due date<input className="field mt-1" type="date" value={editing.dueAt} onChange={(e) => setEditing({ ...editing, dueAt: e.target.value })} /></label>
                      <label className="text-sm font-medium">Description<textarea className="field mt-1" rows="2" value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} /></label>
                      <label className="text-sm font-medium">Owner<select className="field mt-1" value={editing.assignedToId} onChange={(e) => setEditing({ ...editing, assignedToId: e.target.value })}><option value="">Unassigned</option>{staff.map((member) => <option key={member.id} value={member.id}>{member.fullName}</option>)}</select></label>
                      <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Save details</button><button type="button" className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button></div>
                    </form>
                  ) : (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-2 text-navy">
                          {milestone.status === 'COMPLETED' ? <CheckCircle2 size={18} className="text-teal" /> : <Circle size={18} className="text-slate" />}
                          <h3 className="min-w-0 flex-1 break-words font-semibold">{milestone.title}</h3>
                          <span className="shrink-0"><StatusBadge status={milestone.status} /></span>
                        </div>
                        {milestone.description && <p className="mt-2 text-sm text-slate">{milestone.description}</p>}
                        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-slate">
                          <span className="flex items-center gap-1"><CalendarClock size={14} /> Due {milestone.dueAt ? new Date(milestone.dueAt).toLocaleDateString() : 'date not set'}</span>
                          <span className="flex items-center gap-1"><UserRound size={14} /> {milestone.assignedTo?.fullName || 'Unassigned'}</span>
                        </div>
                      </div>
                      {can('pipeline.manage') && <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
                        <select className="field w-full sm:w-40" aria-label={`Status for ${milestone.title}`} value={milestone.status} onChange={(e) => updateMilestone(milestone.id, { status: e.target.value })}>
                          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                        <button className="btn-ghost" onClick={() => setEditing({
                          id: milestone.id,
                          title: milestone.title,
                          description: milestone.description || '',
                          dueAt: dateValue(milestone.dueAt),
                          assignedToId: milestone.assignedToId || '',
                        })}>Edit</button>
                      </div>}
                    </div>
                  )}
                </article>
              ))}
              {overview.milestones.length === 0 && <div className="card text-sm text-slate">No milestones yet. Use the template to create the standard exam preparation timeline, or add your own milestones.</div>}
            </div>
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-navy">School entry follow-up</h2>
                <p className="text-sm text-slate">Schools with no submission, or whose latest submission needs changes, are outstanding.</p>
              </div>
              {can('entries.remind') && <button className="btn-primary" disabled={busy || reminderCount === 0} onClick={remindSchools}><BellRing size={16} /> {busy ? 'Sending…' : `Remind outstanding (${reminderCount})`}</button>}
            </div>
            <div className="card overflow-x-auto p-0">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">School</th><th className="p-3">Latest entry</th><th className="p-3">Students</th><th className="p-3">Reminder</th><th className="p-3">Review</th></tr></thead>
                <tbody>
                  {overview.schools.map((school) => (
                    <tr key={school.id} className="border-b border-line last:border-0">
                      <td className="p-3"><span className="font-mono text-xs">{school.code}</span><div className="font-medium">{school.name}</div></td>
                      <td className="p-3">{school.submission ? <><StatusBadge status={school.submission.status} />{school.submission.reviewNote && <p className="mt-1 max-w-xs text-xs text-slate">{school.submission.reviewNote}</p>}</> : <span className="text-amber-800">Not submitted</span>}</td>
                      <td className="p-3">{school.submission?.totalRecords ?? '—'}</td>
                      <td className="p-3 text-xs text-slate">{school.reminder ? `Last sent ${new Date(school.reminder.lastSentAt).toLocaleString()} (${school.reminder.sentCount} total)` : 'Not sent'}</td>
                      <td className="p-3">{school.submission && can('students.view') ? <Link className="font-medium text-teal underline" to="/student-entries">Review entries</Link> : '—'}</td>
                    </tr>
                  ))}
                  {overview.schools.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No active schools found.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
