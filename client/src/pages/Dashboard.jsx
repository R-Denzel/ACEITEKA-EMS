import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BarChart3, BookOpen, Building2, CalendarDays, FileCheck, GraduationCap, Users } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

const TILES = [
  { key: 'schools', label: 'Schools', icon: Building2 },
  { key: 'activeSessions', label: 'Examination sessions in progress', icon: CalendarDays },
  { key: 'approvedStudents', label: 'Approved students', icon: GraduationCap },
  { key: 'pendingSubmissions', label: 'Student entries waiting for review', icon: BookOpen },
  { key: 'nominationsWaiting', label: 'Recommended examiners waiting for review', icon: Users },
  { key: 'resultsAwaiting', label: 'Results waiting for approval', icon: FileCheck },
  { key: 'resultsReady', label: 'Results ready to send to schools', icon: BarChart3 },
];

export default function Dashboard() {
  const { can } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (can('reports.view')) api('/dashboard').then(setData).catch((e) => setError(e.message));
  }, [can]);

  const priorities = useMemo(() => {
    if (!data) return [];
    return [
      { label: 'Review student entries', value: data.pendingSubmissions, tone: 'teal' },
      { label: 'Check examiner recommendations', value: data.nominationsWaiting, tone: 'blue' },
      { label: 'Approve results', value: data.resultsAwaiting, tone: 'amber' },
      { label: 'Send released results', value: data.resultsReady, tone: 'slate' },
    ];
  }, [data]);

  return (
    <>
      <PageHeader title="Home" description="A quick summary of what is happening across ACEITEKA examinations." />
      {!can('reports.view') && <div className="card text-sm text-slate">Welcome. Use the menu on the left to start your work.</div>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {can('reports.view') && !data && !error && <p className="text-slate">Loading…</p>}
      {data && (
        <div className="space-y-6">
          {data.dashboardAnnouncements?.length > 0 && (
            <section aria-label="Staff dashboard announcements" className="card border-l-4 border-blue-500">
              <h2 className="font-semibold text-navy">Staff dashboard announcements</h2>
              <div className="mt-3 space-y-3">
                {data.dashboardAnnouncements.map((announcement) => (
                  <article key={announcement.id} className="rounded-lg bg-blue-50 p-3">
                    <h3 className="font-semibold text-blue-900">{announcement.title}</h3>
                    <p className="mt-1 whitespace-pre-line text-sm text-blue-900">{announcement.body}</p>
                    <p className="mt-2 text-xs text-blue-700">{new Date(announcement.createdAt).toLocaleString()}</p>
                  </article>
                ))}
              </div>
            </section>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {TILES.map(({ key, label, icon: Icon }) => (
              <div key={key} className="card flex items-start gap-3">
                <div className="rounded-lg bg-navy/5 p-2 text-navy"><Icon size={18} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-2xl font-bold text-navy">{data[key]}</div>
                  <div className="mt-1 text-sm text-slate">{label}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
            <div className="card">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-semibold text-navy">Priority queue</h2>
                <span className="text-xs uppercase tracking-wide text-slate">Live</span>
              </div>
              <div className="mt-4 space-y-3">
                {priorities.map(({ label, value, tone }) => (
                  <div key={label} className="flex items-center justify-between gap-3 rounded-lg border border-line bg-page px-3 py-2">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${tone === 'teal' ? 'bg-teal' : tone === 'blue' ? 'bg-blue-500' : tone === 'amber' ? 'bg-amber-500' : 'bg-slate-500'}`} />
                      <span className="text-sm text-slate">{label}</span>
                    </div>
                    <div className="flex items-center gap-2 text-navy">
                      <span className="text-xl font-bold">{value}</span>
                      <ArrowRight size={16} />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="card">
              <h2 className="font-semibold text-navy">Operational snapshot</h2>
              <div className="mt-4 space-y-3 text-sm text-slate">
                <div className="rounded-lg bg-teal/5 p-3 text-deep">
                  <div className="font-semibold">{data.approvedStudents} approved students</div>
                  <div className="mt-1">The official register is ready for subject and results activity.</div>
                </div>
                <div className="rounded-lg bg-blue-50 p-3 text-blue-900">
                  <div className="font-semibold">{data.activeSessions} sessions active</div>
                  <div className="mt-1">Operational work is ongoing across the active examination cycle.</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3 text-amber-900">
                  <div className="font-semibold">{data.resultsReady} results ready</div>
                  <div className="mt-1">Release them to schools when the approval chain is complete.</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
