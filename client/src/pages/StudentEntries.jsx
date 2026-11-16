import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge, { STATUS_LABELS } from '../components/StatusBadge';

const ErrorRows = ({ rows }) => (
  <div className="card mt-3 overflow-x-auto p-0">
    <table className="w-full text-left text-sm">
      <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Row</th><th className="p-3">Student</th><th className="p-3">What to fix</th></tr></thead>
      <tbody>{rows.map((r) => (
        <tr key={r.rowNumber} className="border-b border-line last:border-0 align-top">
          <td className="p-3 font-mono">{r.rowNumber}</td><td className="p-3">{r.data.full_name || '(no name)'}<div className="font-mono text-xs text-slate">{r.data.registration_number}</div></td>
          <td className="p-3"><ul className="list-disc pl-4 text-red-800">{(r.errors || []).map((e, i) => <li key={i}>{e.message}</li>)}</ul></td>
        </tr>))}</tbody>
    </table>
  </div>
);

// ---------- School view ----------
function SchoolEntries() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [list, setList] = useState([]);
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(null);

  const load = () => api('/school-portal/submissions').then((d) => setList(d.items));
  useEffect(() => { api('/school-portal/sessions').then((d) => { const o = d.items.filter((s) => s.status === 'REGISTRATION_OPEN'); setSessions(o); if (o[0]) setSessionId(o[0].id); }); load(); }, []);

  async function send(e) {
    e.preventDefault(); setError('');
    if (!file) return setError('Choose a file to upload.');
    setBusy(true);
    const fd = new FormData(); fd.append('sessionId', sessionId); fd.append('file', file);
    try {
      const res = await fetch('/api/school-portal/submissions', { method: 'POST', body: fd, credentials: 'include' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The upload failed.');
      setFile(null); e.target.reset(); await load(); await show(data.id);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  const show = (id) => api(`/school-portal/submissions/${id}`).then(setOpen);

  return (
    <>
      <PageHeader title="Register Students" description="Upload the students who have been entered for an examination. We check the file straight away and tell you what to fix." />
      <form onSubmit={send} className="card mb-6 grid gap-4 sm:grid-cols-3">
        <label className="text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select>
          {sessions.length === 0 && <span className="text-xs text-slate">Registration is not open yet.</span>}
        </label>
        <label className="text-sm font-medium sm:col-span-2">File (CSV or Excel .xlsx, up to 5 MB)
          <input className="field mt-1" type="file" accept=".csv,.xlsx" onChange={(e) => setFile(e.target.files[0])} />
        </label>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <button className="btn-primary" disabled={busy || !sessionId}>{busy ? 'Checking your file…' : 'Upload and check'}</button>
          <a className="text-sm font-medium text-teal underline" href={`/api/school-portal/student-template?sessionId=${sessionId}`}>Download the template</a>
        </div>
        <p className="text-xs text-slate sm:col-span-3">Columns: registration_number, full_name, date_of_birth (YYYY-MM-DD, for example 2009-03-25), gender (M or F), subjects (codes separated by a semicolon, for example MATH;ENG;PHY).</p>
        {error && <p role="alert" className="text-red-700 sm:col-span-3">{error}</p>}
      </form>

      {open && (
        <div className="card mb-6">
          <div className="flex items-center justify-between"><h2 className="font-semibold text-navy">{open.fileName}</h2><StatusBadge status={open.status} /></div>
          <p className="mt-1 text-sm text-slate">{open.totalRecords} students checked: {open.validRecords} correct, {open.invalidRecords} need fixing.</p>
          {open.reviewNote && <p className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">Message from ACEITEKA: {open.reviewNote}</p>}
          {open.errorRows?.length > 0 && <ErrorRows rows={open.errorRows} />}
          {open.status === 'CHANGES_REQUIRED' && <p className="mt-3 text-sm">Correct the rows above in your file, then upload it again.</p>}
        </div>
      )}

      <h2 className="mb-2 font-semibold text-navy">Your uploads</h2>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Date</th><th className="p-3">Session</th><th className="p-3">File</th><th className="p-3">Students</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list.map((s) => (<tr key={s.id} className="border-b border-line last:border-0"><td className="p-3 text-xs">{new Date(s.submittedAt).toLocaleString()}</td><td className="p-3">{s.session.name} {s.session.year}</td><td className="p-3">{s.fileName}</td><td className="p-3">{s.totalRecords}</td><td className="p-3"><StatusBadge status={s.status} /></td><td className="p-3"><button className="btn-ghost" onClick={() => show(s.id)}>View</button></td></tr>))}
            {list.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate">You have not uploaded anything yet. Download the template, fill it in, and upload it above.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- ACEITEKA staff view ----------
function StaffEntries() {
  const { can } = useAuth();
  const [status, setStatus] = useState('');
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const load = () => api(`/submissions${status ? `?status=${status}` : ''}`).then((d) => setList(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); }, [status]);
  const show = (id) => { setNote(''); setError(''); api(`/submissions/${id}`).then(setOpen); };
  async function act(action) {
    setError('');
    try { await api(`/submissions/${open.id}/${action}`, { method: 'POST', body: { note } }); await load(); await show(open.id); } catch (e) { setError(e.message); }
  }
  const actionable = open && ['SUBMITTED', 'UNDER_REVIEW'].includes(open.status);

  return (
    <>
      <PageHeader title="Student Entries" description="Review the students that schools have uploaded. Approving an entry adds the students to the official register." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <select className="field mb-4 max-w-xs" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
        <option value="">All statuses</option>{['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED', 'APPROVED', 'REJECTED'].map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
      </select>
      {open && (
        <div className="card mb-6">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-navy">{open.school.name}: {open.fileName}</h2><StatusBadge status={open.status} /></div>
          <p className="mt-1 text-sm text-slate">{open.totalRecords} students, {open.invalidRecords} with errors.</p>
          {open.records.some((r) => !r.isValid) && <ErrorRows rows={open.records.filter((r) => !r.isValid)} />}
          {actionable && (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-medium">Note to the school (needed if you return or reject)<input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Explain what needs to change" /></label>
              <div className="flex flex-wrap gap-2">
                {open.status === 'SUBMITTED' && can('students.review') && <button className="btn-ghost" onClick={() => act('start-review')}>Start review</button>}
                {can('students.review') && <button className="btn-ghost" onClick={() => act('return')}>Return for changes</button>}
                {can('students.approve') && <button className="btn-ghost" onClick={() => confirm('Reject this entry?') && act('reject')}>Reject</button>}
                {can('students.approve') && <button className="btn-primary" onClick={() => confirm(`Approve and add ${open.totalRecords} students to the official register?`) && act('approve')}>Approve</button>}
              </div>
            </div>
          )}
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">School</th><th className="p-3">Session</th><th className="p-3">Students</th><th className="p-3">Sent</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list?.map((s) => (<tr key={s.id} className="border-b border-line last:border-0"><td className="p-3">{s.school.name}</td><td className="p-3">{s.session.name} {s.session.year}</td><td className="p-3">{s.totalRecords}</td><td className="p-3 text-xs">{new Date(s.submittedAt).toLocaleString()}</td><td className="p-3"><StatusBadge status={s.status} /></td><td className="p-3"><button className="btn-ghost" onClick={() => show(s.id)}>Open</button></td></tr>))}
            {list?.length === 0 && <tr><td colSpan="6" className="p-6 text-center text-slate">No entries match. Entries appear here when schools upload them.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function StudentEntries() {
  const { user } = useAuth();
  return user.userType === 'SCHOOL' ? <SchoolEntries /> : <StaffEntries />;
}
