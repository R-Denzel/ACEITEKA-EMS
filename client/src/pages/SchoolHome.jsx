import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

export default function SchoolHome() {
  const [school, setSchool] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { api('/school-portal/profile').then(setSchool).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <PageHeader title="My School" description="Your school's details. Student entries, recommended examiners and results will appear here as they are added." />
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {school && (
        <div className="card text-sm">
          <div className="text-lg font-semibold text-navy">{school.name}</div>
          <div className="mt-2 text-slate">School code: <span className="font-mono">{school.code}</span></div>
          <div className="text-slate">Examination centre: {school.centre?.name || 'Not assigned yet'}</div>
        </div>
      )}
    </>
  );
}
