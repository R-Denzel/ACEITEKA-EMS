import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { STATUS_LABELS } from '../components/StatusBadge';

const LABEL = { SUBMITTED_FOR_CHECK: 'Waiting to be checked', CHECKED: 'Checked', APPROVED: 'Approved', RELEASED: 'Sent to schools', CHANGES_REQUIRED: 'Changes Required', REJECTED: 'Rejected', DRAFT: 'Draft' };

const Counts = ({ title, data, status }) => (
  <div className="card"><h2 className="mb-2 font-semibold text-navy">{title}</h2>
    {Object.keys(data || {}).length === 0 ? <p className="text-sm text-slate">Nothing yet.</p> :
      <ul className="space-y-1 text-sm">{Object.entries(data).map(([k, v]) => <li key={k} className="flex justify-between"><span>{status ? (STATUS_LABELS[k] || LABEL[k] || k) : k}</span><b>{v}</b></li>)}</ul>}
  </div>
);

export default function Reports() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/sessions').then((d) => { setSessions(d.items); if (d.items[0]) setSessionId(d.items[0].id); }).catch((e) => setError(e.message)); }, []);
  useEffect(() => { if (sessionId) api(`/reports/summary?sessionId=${sessionId}`).then(setData).catch((e) => setError(e.message)); }, [sessionId]);

  return (
    <>
      <PageHeader title="Reports" description="A summary for one examination session. Figures come straight from the records." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <select className="field mb-4 max-w-xs" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Examination session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select>
      {data && (
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card"><div className="text-sm text-slate">Approved students</div><div className="text-3xl font-bold text-navy">{data.students.total}</div>
            <div className="mt-1 text-sm text-slate">Male {data.students.gender.M || 0}, Female {data.students.gender.F || 0}</div></div>
          <Counts title="Students by school" data={data.students.bySchool} />
          <Counts title="Students by subject" data={data.students.bySubject} />
          <Counts title="Student entries" data={data.entries} status />
          <Counts title="Recommended examiners" data={data.examinerRecommendations} status />
          <Counts title="Results" data={data.resultBatches} status />
          <div className="card md:col-span-3 overflow-x-auto p-0">
            <h2 className="p-3 font-semibold text-navy">Marks (approved or sent results only)</h2>
            <table className="w-full text-left text-sm"><thead className="border-y border-line bg-page text-slate"><tr><th className="p-3">Subject</th><th className="p-3">Students</th><th className="p-3">Average</th><th className="p-3">Lowest</th><th className="p-3">Highest</th></tr></thead>
              <tbody>{data.marks.map((m) => <tr key={m.subjectCode} className="border-b border-line last:border-0"><td className="p-3 font-mono">{m.subjectCode}</td><td className="p-3">{m.count}</td><td className="p-3">{m.average}</td><td className="p-3">{m.lowest}</td><td className="p-3">{m.highest}</td></tr>)}
                {data.marks.length === 0 && <tr><td colSpan="5" className="p-4 text-center text-slate">No approved results yet.</td></tr>}</tbody></table>
          </div>
        </div>
      )}
    </>
  );
}
