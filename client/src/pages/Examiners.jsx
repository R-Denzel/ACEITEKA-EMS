import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge, { STATUS_LABELS } from '../components/StatusBadge';

const Docs = ({ docs, base }) => docs.length === 0 ? <span className="text-slate">No documents attached</span> : (
  <ul className="list-disc pl-4">{docs.map((d) => <li key={d.id}><a className="font-medium text-teal underline" href={`${base}/documents/${d.id}`}>{d.name}</a></li>)}</ul>
);

// ---------- School: Recommend Examiners ----------
function SchoolExaminers() {
  const [sessions, setSessions] = useState([]);
  const [list, setList] = useState([]);
  const [form, setForm] = useState({ sessionId: '', subjectCode: '', fullName: '', email: '', phone: '', nationalId: '', qualifications: '', experience: '' });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = () => api('/school-portal/nominations').then((d) => setList(d.items));
  useEffect(() => {
    api('/school-portal/sessions').then((d) => { const s = d.items.filter((x) => x.status !== 'COMPLETED'); setSessions(s); if (s[0]) setForm((f) => ({ ...f, sessionId: s[0].id })); });
    load();
  }, []);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const subjects = sessions.find((s) => s.id === form.sessionId)?.subjects ?? [];

  async function send(e) {
    e.preventDefault(); setError(''); setDone(''); setBusy(true);
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v && fd.append(k, v));
    files.forEach((f) => fd.append('documents', f));
    try {
      const res = await fetch('/api/school-portal/nominations', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.fields ? Object.values(data.fields).flat().join(' ') : data.error || 'The recommendation could not be sent.');
      setDone(`${data.fullName} has been recommended. ACEITEKA will review it.`);
      setForm({ ...form, fullName: '', email: '', phone: '', nationalId: '', qualifications: '', experience: '' }); setFiles([]); e.target.reset(); load();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Recommend Examiners" description="Recommend a teacher from your school to mark an examination. A recommendation is not an appointment: ACEITEKA checks it first and chooses who marks." />
      <form onSubmit={send} className="card mb-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Examination session
          <select className="field mt-1" value={form.sessionId} onChange={set('sessionId')}>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select></label>
        <label className="text-sm font-medium">Subject
          <select className="field mt-1" value={form.subjectCode} onChange={set('subjectCode')} required><option value="">Choose a subject</option>{subjects.map((s) => <option key={s.subject.code} value={s.subject.code}>{s.subject.name}</option>)}</select></label>
        <label className="text-sm font-medium">Full name<input className="field mt-1" value={form.fullName} onChange={set('fullName')} required /></label>
        <label className="text-sm font-medium">National ID<input className="field mt-1" value={form.nationalId} onChange={set('nationalId')} /></label>
        <label className="text-sm font-medium">Email<input className="field mt-1" type="email" value={form.email} onChange={set('email')} /></label>
        <label className="text-sm font-medium">Phone<input className="field mt-1" value={form.phone} onChange={set('phone')} /></label>
        <label className="text-sm font-medium sm:col-span-2">Qualifications<textarea className="field mt-1" rows="2" value={form.qualifications} onChange={set('qualifications')} required /></label>
        <label className="text-sm font-medium sm:col-span-2">Teaching or marking experience<textarea className="field mt-1" rows="2" value={form.experience} onChange={set('experience')} /></label>
        <label className="text-sm font-medium sm:col-span-2">Supporting documents (PDF, PNG or JPG, up to 3 files, 5 MB each)
          <input className="field mt-1" type="file" multiple accept=".pdf,.png,.jpg,.jpeg" onChange={(e) => setFiles(Array.from(e.target.files).slice(0, 3))} /></label>
        <p className="text-xs text-slate sm:col-span-2">Give a national ID or an email address, so we can recognise the person if they are recommended again.</p>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy}>{busy ? 'Sending…' : 'Send recommendation'}</button></div>
        {error && <p role="alert" className="text-red-700 sm:col-span-2">{error}</p>}
        {done && <p role="status" className="text-teal sm:col-span-2">{done}</p>}
      </form>

      <h2 className="mb-2 font-semibold text-navy">Your recommendations</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Name</th><th className="p-3">Subject</th><th className="p-3">Session</th><th className="p-3">Status</th><th className="p-3">Message from ACEITEKA</th></tr></thead>
          <tbody>
            {list.map((n) => (<tr key={n.id} className="border-b border-line align-top last:border-0"><td className="p-3">{n.fullName}</td><td className="p-3 font-mono text-xs">{n.subjectCode}</td><td className="p-3">{n.session.name} {n.session.year}</td><td className="p-3"><StatusBadge status={n.status} /></td><td className="p-3 text-slate">{n.reviewNote || ''}</td></tr>))}
            {list.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">You have not recommended anyone yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- Staff: Recommended Examiners ----------
function StaffNominations() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api(`/nominations${status ? `?status=${status}` : ''}`).then((d) => setList(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [status]);
  const show = (id) => { setNote(''); setError(''); setMsg(''); api(`/nominations/${id}`).then(setOpen); };
  async function act(action) {
    setError(''); setMsg('');
    try {
      const r = await api(`/nominations/${open.id}/${action}`, { method: 'POST', body: { note } });
      if (action === 'approve') setMsg('Approved. The examiner is now on the verified examiner list. They have not been assigned to any marking yet: use Assign Examiners for that.');
      await load(); const fresh = await api(`/nominations/${open.id}`); setOpen(fresh); return r;
    } catch (e) { setError(e.message); }
  }
  const actionable = open && ['SUBMITTED', 'UNDER_REVIEW'].includes(open.status);

  return (
    <>
      <PageHeader title="Recommended Examiners" description="Check the examiners that schools recommend. Approving verifies the person. It does not assign them to marking." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {msg && <p role="status" className="mb-3 text-teal">{msg}</p>}
      <select className="field mb-4 max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option>{['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      {open && (
        <div className="card mb-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-navy">{open.fullName}: {open.subjectCode}</h2><StatusBadge status={open.status} /></div>
          <dl className="mt-3 grid gap-2 sm:grid-cols-2">
            <div><dt className="text-slate">Recommended by</dt><dd>{open.school.name}</dd></div>
            <div><dt className="text-slate">Session</dt><dd>{open.session.name} {open.session.year}</dd></div>
            <div><dt className="text-slate">National ID</dt><dd className="font-mono">{open.nationalId || '-'}</dd></div>
            <div><dt className="text-slate">Email / phone</dt><dd>{open.email || '-'} / {open.phone || '-'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate">Qualifications</dt><dd>{open.qualifications}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate">Experience</dt><dd>{open.experience || '-'}</dd></div>
            <div className="sm:col-span-2"><dt className="text-slate">Documents</dt><dd><Docs docs={open.documents} base={`/api/nominations/${open.id}`} /></dd></div>
          </dl>
          {actionable && (
            <div className="mt-4 space-y-3">
              <label className="block font-medium">Note to the school (needed if you return or reject)<input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                {open.status === 'SUBMITTED' && can('examiners.review') && <button className="btn-ghost" onClick={() => act('start-review')}>Start review</button>}
                {can('examiners.review') && <button className="btn-ghost" onClick={() => act('return')}>Return for changes</button>}
                {can('examiners.approve') && <button className="btn-ghost" onClick={() => confirm('Reject this recommendation?') && act('reject')}>Reject</button>}
                {can('examiners.approve') && <button className="btn-primary" onClick={() => act('approve')}>Approve</button>}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Name</th><th className="p-3">Subject</th><th className="p-3">School</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list?.map((n) => (<tr key={n.id} className="border-b border-line last:border-0"><td className="p-3">{n.fullName}</td><td className="p-3 font-mono text-xs">{n.subjectCode}</td><td className="p-3">{n.school.name}</td><td className="p-3"><StatusBadge status={n.status} /></td><td className="p-3"><button className="btn-ghost" onClick={() => show(n.id)}>Open</button></td></tr>))}
            {list?.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No recommendations match.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Examiners() {
  const { user } = useAuth();
  return user.userType === 'SCHOOL' ? <SchoolExaminers /> : <StaffNominations />;
}
