import { useEffect, useState } from 'react';
import { FileCheck2, Upload } from 'lucide-react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

export default function ExamSetter() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [subjectCode, setSubjectCode] = useState('');
  const [script, setScript] = useState(null);
  const [guide, setGuide] = useState(null);
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selectedSession = sessions.find((session) => session.id === sessionId);
  const subjects = selectedSession?.subjects.map((entry) => entry.subject) || [];
  const loadMaterials = () => api('/setter/materials').then((data) => setItems(data.items)).catch((err) => setError(err.message));

  useEffect(() => {
    api('/setter/sessions')
      .then(({ items: sessionsList }) => {
        setSessions(sessionsList);
        if (sessionsList[0]) setSessionId(sessionsList[0].id);
      })
      .catch((err) => setError(err.message));
    loadMaterials();
  }, []);

  useEffect(() => {
    if (subjects.length && !subjects.some((subject) => subject.code === subjectCode)) setSubjectCode(subjects[0].code);
    if (!subjects.length) setSubjectCode('');
  }, [sessionId, sessions]);

  async function submit(e) {
    e.preventDefault(); setError(''); setNotice('');
    if (!script || !guide) return setError('Select both the exam script and marking guide.');
    const body = new FormData();
    body.append('sessionId', sessionId);
    body.append('subjectCode', subjectCode);
    body.append('script', script);
    body.append('guide', guide);
    setBusy(true);
    try {
      const response = await fetch('/api/setter/materials', { method: 'POST', body, credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The documents could not be submitted.');
      setScript(null); setGuide(null); e.target.reset();
      setNotice('Your script and marking guide were submitted for ACEITEKA review.');
      await loadMaterials();
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  return (
    <>
      <PageHeader title="Exam Setter Workspace" description="Submit one exam script and its matching marking guide for each subject. Documents remain private until ACEITEKA approves them." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-3 text-teal">{notice}</p>}
      <form onSubmit={submit} className="card mb-8 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} {session.year}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Subject
          <select className="field mt-1" value={subjectCode} onChange={(e) => setSubjectCode(e.target.value)} disabled={!subjects.length} required>
            {subjects.map((subject) => <option key={subject.code} value={subject.code}>{subject.code} — {subject.name}</option>)}
          </select>
        </label>
        <label className="text-sm font-medium">Exam script (PDF or DOCX, up to 20 MB)
          <input className="field mt-1" type="file" accept=".pdf,.docx" onChange={(e) => setScript(e.target.files[0] || null)} required />
        </label>
        <label className="text-sm font-medium">Marking guide (PDF or DOCX, up to 20 MB)
          <input className="field mt-1" type="file" accept=".pdf,.docx" onChange={(e) => setGuide(e.target.files[0] || null)} required />
        </label>
        <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 sm:col-span-2">Do not upload answer keys in the exam script file. ACEITEKA must approve both files before they are released to the printing team.</div>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || !sessionId || !subjectCode}><Upload size={16} /> {busy ? 'Submitting…' : 'Submit script and guide'}</button></div>
      </form>

      <div className="mb-3 flex items-center gap-2"><FileCheck2 size={18} className="text-navy" /><h2 className="text-lg font-semibold text-navy">My submissions</h2></div>
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Submitted</th><th className="p-3">Session</th><th className="p-3">Subject</th><th className="p-3">Files</th><th className="p-3">Review status</th></tr></thead>
          <tbody>
            {items.map((item) => <tr key={item.id} className="border-b border-line align-top last:border-0">
              <td className="p-3 text-xs">{new Date(item.submittedAt).toLocaleString()}</td>
              <td className="p-3">{item.session?.name} {item.session?.year}</td>
              <td className="p-3 font-mono">{item.subjectCode}</td>
              <td className="p-3 text-xs">{item.scriptName}<br />{item.guideName}</td>
              <td className="p-3"><StatusBadge status={item.status} />{item.reviewNote && <p className="mt-1 max-w-xs text-xs text-amber-900">{item.reviewNote}</p>}</td>
            </tr>)}
            {items.length === 0 && <tr><td colSpan="5" className="p-6 text-center text-slate">You have not submitted any examination materials yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
