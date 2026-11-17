import { useEffect, useState } from 'react';
import { Check, Download, RotateCcw } from 'lucide-react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

export default function ExamMaterials() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [items, setItems] = useState([]);
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busyId, setBusyId] = useState('');

  const loadItems = (id = sessionId) => {
    if (!id) return;
    api(`/exam-materials?sessionId=${encodeURIComponent(id)}`)
      .then(({ items: submissions }) => setItems(submissions))
      .catch((err) => setError(err.message));
  };
  useEffect(() => {
    api('/sessions')
      .then(({ items: sessionsList }) => {
        setSessions(sessionsList);
        if (sessionsList[0]) setSessionId(sessionsList[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);
  useEffect(() => { if (sessionId) loadItems(sessionId); }, [sessionId]);

  async function review(item, status) {
    setBusyId(item.id); setError(''); setNotice('');
    try {
      await api(`/exam-materials/${item.id}/review`, { method: 'PATCH', body: { status, reviewNote: notes[item.id] || '' } });
      setNotice(status === 'APPROVED' ? `${item.subjectCode} materials approved and released to printing.` : 'Changes requested. The setter will see your note.');
      await loadItems();
    } catch (err) { setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message); }
    finally { setBusyId(''); }
  }

  return (
    <>
      <PageHeader title="Review Examination Materials" description="Review the script and marking guide as a pair. Approval makes both files available to the printing dashboard." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-3 text-teal">{notice}</p>}
      <div className="card mb-6">
        <label className="block max-w-xl text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} {session.year}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-4">
        {items.map((item) => (
          <article key={item.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h2 className="font-semibold text-navy">{item.subjectCode} · {item.session?.name} {item.session?.year}</h2><p className="mt-1 text-xs text-slate">Submitted by {item.submittedBy?.fullName || 'Setter'} · {new Date(item.submittedAt).toLocaleString()}</p></div>
              <StatusBadge status={item.status} />
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <a className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm font-medium text-teal underline" href={`/api/exam-materials/${item.id}/script`}><Download size={16} /> Exam script: {item.scriptName}</a>
              <a className="flex items-center gap-2 rounded-lg border border-line p-3 text-sm font-medium text-teal underline" href={`/api/exam-materials/${item.id}/guide`}><Download size={16} /> Marking guide: {item.guideName}</a>
            </div>
            {item.status !== 'APPROVED' && (
              <div className="mt-4">
                <label className="block text-sm font-medium">Review note (required when requesting changes)
                  <textarea className="field mt-1" rows="2" value={notes[item.id] || ''} onChange={(e) => setNotes({ ...notes, [item.id]: e.target.value })} />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className="btn-primary" disabled={busyId === item.id} onClick={() => review(item, 'APPROVED')}><Check size={16} /> Approve both files</button>
                  <button className="btn-ghost" disabled={busyId === item.id} onClick={() => review(item, 'CHANGES_REQUIRED')}><RotateCcw size={16} /> Request changes</button>
                </div>
              </div>
            )}
            {item.reviewNote && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Review note: {item.reviewNote}</p>}
          </article>
        ))}
        {items.length === 0 && <div className="card text-center text-sm text-slate">No setter materials submitted for this session yet.</div>}
      </div>
    </>
  );
}
