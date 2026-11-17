import { useEffect, useMemo, useState } from 'react';
import { BarChart3, BookOpen, GraduationCap, Users } from 'lucide-react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';
import { STATUS_LABELS } from '../components/StatusBadge';

const LABEL = { SUBMITTED_FOR_CHECK: 'Waiting to be checked', CHECKED: 'Checked', APPROVED: 'Approved', RELEASED: 'Sent to schools', CHANGES_REQUIRED: 'Changes Required', REJECTED: 'Rejected', DRAFT: 'Draft' };

const Counts = ({ title, data, status }) => (
  <div className="card"><h2 className="mb-2 font-semibold text-navy">{title}</h2>
    {Object.keys(data || {}).length === 0 ? <p className="text-sm text-slate">Nothing yet.</p> :
      <ul className="space-y-1 text-sm">{Object.entries(data).map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span className="text-slate">{status ? (STATUS_LABELS[k] || LABEL[k] || k) : k}</span><b className="text-navy">{v}</b></li>)}</ul>}
  </div>
);

const OverviewCard = ({ icon: Icon, label, value, hint }) => (
  <div className="card flex items-start gap-3">
    <div className="rounded-lg bg-navy/5 p-2 text-navy"><Icon size={18} /></div>
    <div>
      <div className="text-xs uppercase tracking-wide text-slate">{label}</div>
      <div className="mt-1 text-2xl font-bold text-navy">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate">{hint}</div>}
    </div>
  </div>
);

export default function Reports() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/sessions').then((d) => {
      setSessions(d.items || []);
      if (d.items && d.items[0]) setSessionId(d.items[0].id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    setError('');
    api(`/reports/summary?sessionId=${sessionId}`).then(setData).catch((e) => setError(e.message));
  }, [sessionId]);

  const selectedSession = useMemo(() => sessions.find((s) => s.id === sessionId), [sessions, sessionId]);

  return (
    <>
      <PageHeader title="Reports" description="A summary for one examination session. Figures come straight from the records." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="block text-sm font-medium sm:min-w-[260px]">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)} aria-label="Examination session">{sessions.map((s) => <option key={s.id} value={s.id}>{s.name} {s.year}</option>)}</select>
        </label>
        {selectedSession && <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border border-line bg-page px-3 py-2 text-sm text-slate">Selected: <span className="font-semibold text-navy">{selectedSession.name} ({selectedSession.year})</span></div>
          <a className="btn-primary" href={`/api/reports/summary/export?sessionId=${encodeURIComponent(sessionId)}`} download>Download report (CSV)</a>
        </div>}
      </div>

      {data && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <OverviewCard icon={GraduationCap} label="Approved students" value={data.students.total} hint={`Male ${data.students.gender.M || 0} • Female ${data.students.gender.F || 0}`} />
            <OverviewCard icon={Users} label="Student entries" value={Object.values(data.entries || {}).reduce((sum, value) => sum + Number(value || 0), 0)} hint="Across all submission states" />
            <OverviewCard icon={BookOpen} label="Examiner recommendations" value={Object.values(data.examinerRecommendations || {}).reduce((sum, value) => sum + Number(value || 0), 0)} hint="Total recommendations" />
            <OverviewCard icon={BarChart3} label="Result batches" value={Object.values(data.resultBatches || {}).reduce((sum, value) => sum + Number(value || 0), 0)} hint="All batch states" />
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Counts title="Students by school" data={data.students.bySchool} />
            <Counts title="Students by subject" data={data.students.bySubject} />
            <Counts title="Student entries" data={data.entries} status />
            <Counts title="Recommended examiners" data={data.examinerRecommendations} status />
            <Counts title="Results" data={data.resultBatches} status />
            <div className="card md:col-span-3 overflow-x-auto p-0">
              <h2 className="p-3 font-semibold text-navy">Marks (approved or sent results only)</h2>
              <table className="w-full text-left text-sm"><thead className="border-y border-line bg-page text-slate"><tr><th className="p-3">School</th><th className="p-3">Subject and paper</th><th className="p-3">Students</th><th className="p-3">Average</th><th className="p-3">Lowest</th><th className="p-3">Highest</th></tr></thead>
                <tbody>{data.marks.map((m) => <tr key={`${m.schoolName}-${m.subjectCode}-${m.paperCode}`} className="border-b border-line last:border-0"><td className="p-3">{m.schoolName}</td><td className="p-3 font-mono">{m.subjectCode}{m.paperCode ? ` / ${m.paperCode}` : ''}</td><td className="p-3">{m.count}</td><td className="p-3">{m.average}</td><td className="p-3">{m.lowest}</td><td className="p-3">{m.highest}</td></tr>)}
                  {data.marks.length === 0 && <tr><td colSpan="6" className="p-4 text-center text-slate">No approved results yet.</td></tr>}</tbody></table>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
