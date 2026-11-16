import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function ActivityHistory() {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api(`/activity-history?page=${page}&pageSize=20`).then(setData).catch((e) => setError(e.message)); }, [page]);

  return (
    <>
      <PageHeader title="Activity History" description="A permanent record of important actions, such as sign-ins and changes. It cannot be edited." />
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">When</th><th className="p-3">What happened</th><th className="p-3">Record</th></tr></thead>
          <tbody>
            {data?.items.map((l) => (
              <tr key={l.id} className="border-b border-line last:border-0">
                <td className="p-3 font-mono text-xs">{new Date(l.createdAt).toLocaleString()}</td>
                <td className="p-3">{l.action.replace(/[._]/g, ' ')}</td><td className="p-3 text-slate">{l.entity || '—'}</td>
              </tr>
            ))}
            {data && data.items.length === 0 && <tr><td colSpan="3" className="p-6 text-center text-slate">Nothing has been recorded yet.</td></tr>}
          </tbody>
        </table>
      </div>
      {data && (
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-ghost" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <button className="btn-ghost" disabled={page * 20 >= data.total} onClick={() => setPage(page + 1)}>Next</button>
        </div>
      )}
    </>
  );
}
