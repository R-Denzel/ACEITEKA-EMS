import { useState } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import { Home, School, History, CalendarDays, BookOpen, ClipboardCheck, Users, LogOut, Menu, X, GraduationCap, UserCheck, UserPlus, FileCheck, Megaphone, Mail, BarChart3, KeyRound, Printer, ClipboardList, FileLock2 } from 'lucide-react';
import { useAuth } from '../auth';
import ThemeSelector from './ThemeSelector';

// Simple-English labels. Only pages that already work are listed, so no menu item leads nowhere.
const STAFF_NAV = [
  { to: '/', label: 'Home', icon: Home, end: true, anyOf: ['reports.view', 'results.enter', 'results.review', 'results.approve', 'results.release'] },
  { to: '/schools', label: 'Schools and Centres', icon: School, perm: 'schools.view' },
  { to: '/sessions', label: 'Examination Sessions', icon: CalendarDays, perm: 'schools.view' },
  { to: '/preparation', label: 'Preparation Pipeline', icon: ClipboardList, anyOf: ['pipeline.manage', 'entries.remind'] },
  { to: '/exam-materials', label: 'Review Exam Materials', icon: FileLock2, perm: 'materials.review' },
  { to: '/printer', label: 'Printing Dashboard', icon: Printer, perm: 'print.view' },
  { to: '/setter', label: 'Exam Setter Workspace', icon: FileCheck, perm: 'materials.submit' },
  { to: '/subjects', label: 'Subjects and Subject Groups', icon: BookOpen, perm: 'schools.view' },
  { to: '/student-entries', label: 'Student Entries', icon: ClipboardCheck, perm: 'students.view' },
  { to: '/official-entry-forms', label: 'Official Entry Forms', icon: FileCheck, perm: 'students.view' },
  { to: '/student-register', label: 'Student Register', icon: Users, perm: 'students.view' },
  { to: '/examiners', label: 'Recommended Examiners', icon: UserCheck, perm: 'examiners.review' },
  { to: '/assign-examiners', label: 'Assign Examiners', icon: UserPlus, perm: 'examiners.review' },
  { to: '/results', label: 'Check and Approve Results', icon: FileCheck, anyOf: ['results.enter', 'results.review', 'results.approve', 'results.release'] },
  { to: '/announcements', label: 'Announcements', icon: Megaphone },
  { to: '/messages', label: 'Messages', icon: Mail, perm: 'announcements.manage' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: '/accounts', label: 'Staff and School Accounts', icon: KeyRound, perm: 'users.manage' },
  { to: '/activity-history', label: 'Activity History', icon: History, perm: 'activity.view' },
];
const SCHOOL_NAV = [
  { to: '/school', label: 'My School', icon: Home, end: true },
  { to: '/school/students', label: 'Register Students', icon: ClipboardCheck, perm: 'students.upload' },
  { to: '/school/official-entry-forms', label: 'Official Entry Summary', icon: FileCheck, perm: 'students.upload' },
  { to: '/school/examiners', label: 'Recommend Examiners', icon: UserCheck, perm: 'examiners.nominate' },
  { to: '/school/results', label: 'My Results', icon: FileCheck, perm: 'school.portal' },
  { to: '/school/announcements', label: 'Announcements', icon: Megaphone, perm: 'school.portal' },
  { to: '/school/messages', label: 'Messages', icon: Mail, perm: 'school.portal' },
];

export default function Layout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const nav = (user.userType === 'SCHOOL' ? SCHOOL_NAV : STAFF_NAV).filter((n) => (!n.perm || can(n.perm)) && (!n.anyOf || n.anyOf.some(can)));

  const links = (
    <nav className="mt-6 space-y-1" aria-label="Main menu">
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end} onClick={() => setOpen(false)}
          className={({ isActive }) => `flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/15 text-white' : 'text-blue-100 hover:bg-white/10'}`}>
          <Icon size={18} /> {label}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen lg:flex">
      <aside className="hidden w-64 shrink-0 bg-deep p-5 lg:block">
        <div className="flex items-center gap-2 text-white"><GraduationCap /> <span className="font-bold">ACEITEKA</span></div>
        {links}
      </aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <aside className="relative h-full w-64 bg-deep p-5">
            <button className="absolute right-3 top-3 text-white" onClick={() => setOpen(false)} aria-label="Close menu"><X /></button>
            <div className="flex items-center gap-2 text-white"><GraduationCap /> <span className="font-bold">ACEITEKA</span></div>
            {links}
          </aside>
        </div>
      )}
      <div className="flex-1">
        <header className="flex items-center justify-between border-b border-line bg-white px-4 py-3">
          <button className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu /></button>
          <span className="hidden text-sm text-slate lg:block">Signed in as <b className="text-navy">{user.fullName}</b></span>
          <div className="flex items-center gap-1">
            <ThemeSelector />
            <NavLink to="/change-password" className="btn-ghost">Change password</NavLink>
            <button className="btn-ghost" onClick={logout}><LogOut size={16} /> Sign out</button>
          </div>
        </header>
        <main className="mx-auto max-w-6xl p-4 lg:p-8"><Outlet /></main>
      </div>
    </div>
  );
}
