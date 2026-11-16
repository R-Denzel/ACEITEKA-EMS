import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

// ---------- School: My Results ----------
function SchoolResults() {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/school-portal/results').then((d) => setItems(d.items)).catch((e) => setError(e.message)); }, []);
  const show = (id) => api(`/school-portal/results/${id}`).then((d) => setOpen({ ...d, id })).catch((e) => setError(e.message));
  return (
    <>
      <PageHeader title="My Results" description="Results sent to your school by ACEITEKA. You only see your own students. These results are private to your school." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {items?.length === 0 && <div className="card text-slate">No results have been sent to your school yet. You will see them here once ACEITEKA releases them.</div>}
      <div className="grid gap-3 sm:grid-cols-2">
        {items?.map((r) => (
          <div key={r.batchId} className="card">
            <div className="font-semibold text-navy">{r.subjectCode}</div>
            <div className="text-sm text-slate">{r.session.name} {r.session.year}. Sent {new Date(r.releasedAt).toLocaleDateString()}</div>
            <div className="mt-3 flex gap-2"><button className="btn-ghost" onClick={() => show(r.batchId)}>View</button><a className="btn-ghost" href={`/api/school-portal/results/${r.batchId}/download`}>Download</a></div>
          </div>))}
      </div>
      {open && (
        <div className="card mt-6 overflow-x-auto p-0">
          <div className="border-b border-line p-3 font-semibold text-navy">{open.subjectCode}: {open.session.name} {open.session.year}</div>
          <table className="w-full text-left text-sm"><thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Registration number</th><th className="p-3">Name</th><th className="p-3">Mark</th></tr></thead>
            <tbody>{open.results.map((r) => <tr key={r.registrationNumber} className="border-b border-line last:border-0"><td className="p-3 font-mono">{r.registrationNumber}</td><td className="p-3">{r.fullName}</td><td className="p-3">{r.mark}</td></tr>)}</tbody></table>
        </div>
      )}
    </>
  );
}

const LABEL = { SUBMITTED_FOR_CHECK: 'Waiting to be checked', CHECKED: 'Checked, waiting for approval', APPROVED: 'Approved, not yet sent', RELEASED: 'Sent to schools', CHANGES_REQUIRED: 'Changes Required', REJECTED: 'Rejected' };
const Tag = ({ s }) => <span className="rounded-full bg-page px-2.5 py-0.5 text-xs font-semibold text-navy">{LABEL[s] || s}</span>;

// ---------- Staff: Check and Approve Results ----------
function StaffResults() {
  const { user, can } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [list, setList] = useState(null);
  const [open, setOpen] = useState(null);
  const [form, setForm] = useState({ sessionId: '', subjectCode: '' });
  const [file, setFile] = useState(null);
  const [problems, setProblems] = useState(null);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const load = () => api('/result-batches').then((d) => setList(d.items)).catch((e) => setError(e.message));
  useEffect(() => {
    load();
    api('/sessions').then((d) => { setSessions(d.items); if (d.items[0]) setForm((f) => ({ ...f, sessionId: d.items[0].id })); }).catch(() => {});
    api('/subjects').then((d) => setSubjects(d.items.filter((s) => s.isActive))).catch(() => {});
  }, []);
  const show = (id) => { setNote(''); setError(''); setMsg(''); api(`/result-batches/${id}`).then(setOpen).catch((e) => setError(e.message)); };

  async function send(e) {
    e.preventDefault(); setError(''); setProblems(null); setMsg('');
    if (!file) return setError('Choose a file to upload.');
    const fd = new FormData(); fd.append('sessionId', form.sessionId); fd.append('subjectCode', form.subjectCode); fd.append('file', file);
    const res = await fetch('/api/result-batches', { method: 'POST', body: fd, credentials: 'include' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setError(data.error || 'The upload failed.'); setProblems(data.errors || null); return; }
    setMsg(`Results saved for ${data.count} students. They now wait to be checked by someone else.`); setFile(null); e.target.reset(); load(); show(data.id);
  }
  async function act(action) {
    setError(''); setMsg('');
    try {
      const r = await api(`/result-batches/${open.id}/${action}`, { method: 'POST', body: { note } });
      if (action === 'release') setMsg(`Sent to ${r.schools} school(s). Each school sees only its own students.`);
      await load(); show(open.id);
    } catch (e) { setError(e.message); }
  }
  async function correct(r) {
    const newMark = prompt(`New mark for ${r.registrationNumber} (currently ${r.mark}):`); if (newMark == null) return;
    const reason = prompt('Reason for the correction:'); if (!reason) return;
    try { await api('/result-corrections', { method: 'POST', body: { resultId: r.id, newMark: Number(newMark), reason } }); setMsg('Correction requested. A different approver must approve it.'); } catch (e) { setError(e.message); }
  }
  const mine = (id) => id === user.id;
  const st = open?.status;

  return (
    <>
      <PageHeader title="Check and Approve Results" description="Results are entered by one person, checked by a second, approved by a third, and only then sent to schools." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {msg && <p role="status" className="mb-3 text-teal">{msg}</p>}
      {problems && <div className="card mb-4 max-h-64 overflow-auto text-sm"><ul className="list-disc pl-4 text-red-800">{problems.map((p, i) => <li key={i}>{p.rowNumber ? `Row ${p.rowNumber}: ` : ''}{p.registrationNumber} {p.message}</li>)}</ul></div>}
      {can('results.enter') && (
        <form onSubmit={send} className="card mb-6 grid gap-4 sm:grid-cols-4">
          <label className="text-sm font-medium">Examination session<select className="field mt-1" value={form.sessionId} onChange={(e) => setForm({ ...form, sessionId: e.target.value })}>{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select></label>
          <label className="text-sm font-medium">Subject<select className="field mt-1" value={form.subjectCode} onChange={(e) => setForm({ ...form, subjectCode: e.target.value })} required><option value="">Choose</option>{subjects.map((s) => <option key={s.code} value={s.code}>{s.name}</option>)}</select></label>
          <label className="text-sm font-medium sm:col-span-2">Marks file (CSV: registration_number, mark)<input className="field mt-1" type="file" accept=".csv" onChange={(e) => setFile(e.target.files[0])} /></label>
          <div className="sm:col-span-4"><button className="btn-primary">Upload marks</button></div>
        </form>
      )}
      {open && (
        <div className="card mb-6 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-semibold text-navy">{open.subjectCode}: {open.session.name} {open.session.year}</h2><Tag s={st} /></div>
          <p className="mt-1 text-slate">{open.resultCount} marks.{open.note ? ` Note: ${open.note}` : ''}</p>
          {['SUBMITTED_FOR_CHECK', 'CHECKED'].includes(st) && (
            <div className="mt-3 space-y-3">
              <label className="block font-medium">Note (needed if you return or reject)<input className="field mt-1" value={note} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="flex flex-wrap gap-2">
                {st === 'SUBMITTED_FOR_CHECK' && can('results.review') && !mine(open.enteredById) && <button className="btn-primary" onClick={() => act('check')}>Mark as checked</button>}
                {can('results.review') && !mine(open.enteredById) && <button className="btn-ghost" onClick={() => act('return')}>Return for changes</button>}
                {st === 'CHECKED' && can('results.approve') && !mine(open.enteredById) && !mine(open.checkedById) && <button className="btn-primary" onClick={() => act('approve')}>Approve</button>}
                {can('results.approve') && !mine(open.enteredById) && <button className="btn-ghost" onClick={() => confirm('Reject these results?') && act('reject')}>Reject</button>}
              </div>
              {mine(open.enteredById) && <p className="text-slate">You entered these results, so someone else must check and approve them.</p>}
            </div>
          )}
          {st === 'APPROVED' && can('results.release') && <div className="mt-3"><button className="btn-primary" onClick={() => confirm('Send these results to schools? Each school will see only its own students.') && act('release')}>Send results to schools</button></div>}
          {open.distributions.length > 0 && <div className="mt-3"><div className="font-medium">Sent to</div><ul className="list-disc pl-4 text-slate">{open.distributions.map((d) => <li key={d.school}>{d.school}: {d.firstViewedAt ? 'opened' : 'not opened yet'}, {d.downloadCount} download(s)</li>)}</ul></div>}
          <div className="mt-3 max-h-72 overflow-auto rounded-md border border-line">
            <table className="w-full text-left"><thead className="bg-page text-slate"><tr><th className="p-2">Number</th><th className="p-2">Name</th><th className="p-2">School</th><th className="p-2">Mark</th><th className="p-2"></th></tr></thead>
              <tbody>{open.results.map((r) => <tr key={r.id} className="border-t border-line"><td className="p-2 font-mono">{r.registrationNumber}</td><td className="p-2">{r.fullName}</td><td className="p-2">{r.school}</td><td className="p-2">{r.mark}</td><td className="p-2">{['APPROVED', 'RELEASED'].includes(st) && can('results.enter') && <button className="text-teal underline" onClick={() => correct(r)}>Correct</button>}</td></tr>)}</tbody></table>
          </div>
        </div>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Subject</th><th className="p-3">Session</th><th className="p-3">Marks</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {list?.map((b) => (<tr key={b.id} className="border-b border-line last:border-0"><td className="p-3 font-mono">{b.subjectCode}</td><td className="p-3">{b.session.name} {b.session.year}</td><td className="p-3">{b.resultCount}</td><td className="p-3"><Tag s={b.status} /></td><td className="p-3"><button className="btn-ghost" onClick={() => show(b.id)}>Open</button></td></tr>))}
            {list?.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">No results have been entered yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function Results() {
  const { user } = useAuth();
  return user.userType === 'SCHOOL' ? <SchoolResults /> : <StaffResults />;
}
