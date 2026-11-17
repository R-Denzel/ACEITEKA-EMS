import { useEffect, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function PrinterDashboard() {
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api('/printer/sessions')
      .then(({ items }) => {
        setSessions(items);
        if (items[0]) setSessionId(items[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!sessionId) return;
    api(`/printer/dashboard?sessionId=${encodeURIComponent(sessionId)}`)
      .then(setData)
      .catch((err) => setError(err.message));
  }, [sessionId]);

  const materialBySubject = new Map((data?.materials || []).map((material) => [material.subjectCode, material]));

  function downloadQuantities() {
    const escape = (value) => `"${String(value).replace(/"/g, '""')}"`;
    const rows = [
      ['Session', 'Source', 'Subject code', 'Subject', 'Paper', 'Approved candidates', 'Scripts to print'],
      ...data.subjects.map((subject) => [ `${data.session.name} ${data.session.year}`, 'Approved student register', subject.code, subject.name, '', subject.candidateCount, subject.candidateCount ]),
      ...(data.officialPaperCounts || []).map((paper) => [
        `${data.session.name} ${data.session.year}`, 'Approved official entry forms', paper.subjectCode, paper.subjectName, paper.paperNumber, '', paper.count,
      ]),
    ];
    const csv = rows.map((row) => row.map(escape).join(',')).join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `print-quantities-${data.session.year}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  return (
    <>
      <PageHeader title="Printing Dashboard" description="Use approved student entries to plan script quantities by subject. Only ACEITEKA-approved exam materials are available here." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <div className="card mb-6">
        <label className="block max-w-xl text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} {session.year}</option>)}
          </select>
        </label>
      </div>
      {data && (
        <>
          <div className="card mb-6 flex items-center gap-3">
            <div className="rounded-lg bg-navy/5 p-3 text-navy"><Printer size={22} /></div>
            <div><div className="text-sm text-slate">Approved student register</div><div className="text-3xl font-bold text-navy">{data.totalApprovedStudents}</div></div>
          </div>
          <div className="card overflow-x-auto p-0">
            <div className="flex items-center justify-between gap-3 p-3">
              <h2 className="font-semibold text-navy">Subject print quantities</h2>
              <button type="button" className="btn-ghost" onClick={downloadQuantities}>Export quantities CSV</button>
            </div>
            <table className="w-full text-left text-sm">
              <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Subject</th><th className="p-3">Approved candidates</th><th className="p-3">Exam script</th><th className="p-3">Marking guide</th></tr></thead>
              <tbody>
                {data.subjects.map((subject) => {
                  const material = materialBySubject.get(subject.code);
                  return <tr key={subject.code} className="border-b border-line last:border-0">
                    <td className="p-3"><span className="font-mono">{subject.code}</span><div className="font-medium">{subject.name}</div></td>
                    <td className="p-3 text-xl font-bold text-navy">{subject.candidateCount}</td>
                    {material ? <>
                      <td className="p-3"><a className="inline-flex items-center gap-1 font-medium text-teal underline" href={`/api/printer/materials/${material.id}/script`}><Download size={14} /> {material.scriptName}</a></td>
                      <td className="p-3"><a className="inline-flex items-center gap-1 font-medium text-teal underline" href={`/api/printer/materials/${material.id}/guide`}><Download size={14} /> {material.guideName}</a></td>
                    </> : <td className="p-3 text-slate" colSpan="2">Approved materials are not available yet.</td>}
                  </tr>;
                })}
                {data.subjects.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate">No subjects are assigned to this session.</td></tr>}
              </tbody>
            </table>
          </div>
          {(data.officialPaperCounts || []).length > 0 && (
            <div className="card mt-6 overflow-x-auto p-0">
              <div className="p-3">
                <h2 className="font-semibold text-navy">Official form paper counts</h2>
                <p className="mt-1 text-xs text-slate">Approved paper totals from school entry forms are shown separately from the student register so staff can cross-check them before printing.</p>
              </div>
              <table className="w-full text-left text-sm">
                <thead className="border-y border-line bg-page text-slate"><tr><th className="p-3">Subject</th><th className="p-3">Paper</th><th className="p-3">Official entries</th></tr></thead>
                <tbody>
                  {data.officialPaperCounts.map((paper) => <tr key={`${paper.subjectCode}-${paper.paperNumber}`} className="border-b border-line last:border-0">
                    <td className="p-3"><span className="font-mono">{paper.subjectCode}</span><div className="font-medium">{paper.subjectName}</div></td>
                    <td className="p-3">{paper.paperNumber}</td>
                    <td className="p-3 text-xl font-bold text-navy">{paper.count}</td>
                  </tr>)}
                </tbody>
              </table>
            </div>
          )}
          {(data.officialPaperCounts || []).length === 0 && (
            <p className="card mt-6 text-sm text-slate">
              No approved official entry-form paper counts are available for this session yet. Review and approve the import in Official School Entry Forms, then refresh this dashboard.
            </p>
          )}
          <p className="mt-3 text-xs text-slate">Quantities are based on candidates in the official approved register and count one script per candidate per subject.</p>
        </>
      )}
    </>
  );
}
