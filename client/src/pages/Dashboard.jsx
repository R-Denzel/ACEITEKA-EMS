import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

const TILES = [
  ['schools', 'Schools'], ['activeSessions', 'Examination sessions in progress'], ['approvedStudents', 'Approved students'],
  ['pendingSubmissions', 'Student entries waiting for review'], ['nominationsWaiting', 'Recommended examiners waiting for review'],
  ['resultsAwaiting', 'Results waiting for approval'], ['resultsReady', 'Results ready to send to schools'],
];

export default function Dashboard() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { if (can('reports.view')) api('/dashboard').then(setData).catch((e) => setError(e.message)); }, []);

  return (
    <>
      <PageHeader title="Home" description="A quick summary of what is happening across ACEITEKA examinations." />
      {!can('reports.view') && <div className="card text-sm text-slate">Welcome. Use the menu on the left to start your work.</div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {can('reports.view') && !data && !error && <p className="text-slate">Loading…</p>}
      {data && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TILES.map(([key, label]) => (
            <div key={key} className="card"><div className="font-mono text-3xl font-medium text-navy">{data[key]}</div><div className="mt-1 text-sm text-slate">{label}</div></div>
          ))}
        </div>
      )}
    </>
  );
}
