import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BellRing, BookOpen, Building2, FileCheck, GraduationCap, Mail, UserCheck } from 'lucide-react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const ACTIONS = [
  { to: '/school/students', label: 'Register Students', icon: BookOpen, description: 'Upload and track student entries for the active examination session.' },
  { to: '/school/examiners', label: 'Recommend Examiners', icon: UserCheck, description: 'Send examiner support documents and monitor review status.' },
  { to: '/school/results', label: 'My Results', icon: FileCheck, description: 'Open released results and download school-specific reports.' },
  { to: '/school/messages', label: 'Messages', icon: Mail, description: 'Send updates to ACEITEKA and read replies from the team.' },
  { to: '/school/announcements', label: 'Announcements', icon: BellRing, description: 'See notices that apply to all schools in the portal.' },
];

export default function SchoolHome() {
  const [school, setSchool] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api('/school-portal/profile'),
      api('/school-portal/summary'),
    ])
      .then(([profile, portalSummary]) => {
        setSchool(profile);
        setSummary(portalSummary);
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <PageHeader title="My School" description="A quick snapshot of your school and the tasks that need attention in the portal." />
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {school && (
        <>
          <div className="card mb-6 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-navy"><Building2 size={18} /><span className="text-lg font-semibold">{school.name}</span></div>
                <div className="mt-3 grid gap-2 text-sm text-slate sm:grid-cols-2">
                  <div>School code: <span className="font-mono text-navy">{school.code}</span></div>
                  <div>Examination centre: <span className="text-navy">{school.centre?.name || 'Not assigned yet'}</span></div>
                  {school.address && <div>Address: <span className="text-navy">{school.address}</span></div>}
                  {school.email && <div>Email: <span className="text-navy">{school.email}</span></div>}
                  {school.phone && <div>Phone: <span className="text-navy">{school.phone}</span></div>}
                </div>
              </div>
              <div className="rounded-xl border border-teal/20 bg-teal/5 p-4 text-sm text-deep">
                <div className="flex items-center gap-2 font-semibold"><GraduationCap size={16} /> School status</div>
                <div className="mt-2">{school.isActive ? 'Active and ready for examination work.' : 'This school account is currently inactive.'}</div>
              </div>
            </div>
          </div>

          {summary && (
            <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="card"><div className="text-3xl font-semibold text-navy">{summary.totalSubmissions}</div><div className="mt-1 text-sm text-slate">Student entries submitted</div></div>
              <div className="card"><div className="text-3xl font-semibold text-navy">{summary.pendingEntries}</div><div className="mt-1 text-sm text-slate">Entries needing attention</div></div>
              <div className="card"><div className="text-3xl font-semibold text-navy">{summary.pendingNominations}</div><div className="mt-1 text-sm text-slate">Examiner recommendations in review</div></div>
              <div className="card"><div className="text-3xl font-semibold text-navy">{summary.unreadMessages}</div><div className="mt-1 text-sm text-slate">Unread ACEITEKA messages</div></div>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {ACTIONS.map(({ to, label, description, icon: Icon }) => (
              <Link key={to} to={to} className="card group flex h-full flex-col justify-between gap-4 p-5 text-left transition hover:border-teal/40 hover:bg-teal/5">
                <div>
                  <div className="flex items-center gap-2 text-navy"><Icon size={18} /><span className="font-semibold">{label}</span></div>
                  <p className="mt-3 text-sm text-slate">{description}</p>
                </div>
                <div className="flex items-center justify-between text-sm font-medium text-teal">
                  <span>Open</span>
                  <ArrowRight size={16} className="transition group-hover:translate-x-1" />
                </div>
              </Link>
            ))}
          </div>
        </>
      )}
    </>
  );
}
