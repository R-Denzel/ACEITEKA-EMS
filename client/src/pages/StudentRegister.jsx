import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function StudentRegister() {
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/candidates?q=${encodeURIComponent(q)}&page=${page}&pageSize=20`).then(setData).catch((e) => setError(e.message)); }, [q, page]);

  return (
    <>
      <PageHeader title="Student Register" description="Every approved student, in one list for ACEITEKA staff. This list is private and is never shown to the public.">
        <a className="btn-ghost" href="/api/candidates/export">Download as spreadsheet</a>
      </PageHeader>
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <input className="field mb-4 max-w-sm" placeholder="Search by name or registration number" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Registration number</th><th className="p-3">Name</th><th className="p-3">School</th><th className="p-3">Subjects</th></tr></thead>
          <tbody>
            {data?.items.map((c) => (<tr key={c.id} className="border-b border-line last:border-0"><td className="p-3 font-mono">{c.registrationNumber}</td><td className="p-3">{c.fullName}</td><td className="p-3">{c.school.name}</td><td className="p-3 font-mono text-xs">{c.subjectCodes.join(', ')}</td></tr>))}
            {data?.items.length === 0 && <tr><td colSpan="4" className="p-6 text-center text-slate">No approved students yet. Students appear here once their entries are approved.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && <div className="mt-4 flex items-center justify-between text-sm text-slate"><span>{data.total} students</span><div className="flex gap-2"><button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button><button className="btn-ghost" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</button></div></div>}
    </>
  );
}
