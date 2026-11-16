import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Schools from './pages/Schools';
import ActivityHistory from './pages/ActivityHistory';
import SchoolHome from './pages/SchoolHome';
import Sessions from './pages/Sessions';
import Subjects from './pages/Subjects';
import StudentEntries from './pages/StudentEntries';
import StudentRegister from './pages/StudentRegister';
import Examiners from './pages/Examiners';
import AssignExaminers from './pages/AssignExaminers';
import Results from './pages/Results';
import Announcements from './pages/Announcements';
import Messages from './pages/Messages';
import Reports from './pages/Reports';
import Accounts from './pages/Accounts';
import { ForgotPassword, ResetPassword, ChangePassword } from './pages/PasswordPages';
import ComingSoon from './pages/ComingSoon';

const RESULTS_ANY = ['results.enter', 'results.review', 'results.approve', 'results.release'];
function Protected({ children, permission, anyOf }) {
  const { user, loading, can } = useAuth();
  if (anyOf && user && !anyOf.some(can)) return <p className="p-8">You do not have permission to see this page.</p>;
  if (loading) return <p className="p-8 text-slate">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  // A new account must choose its own password before anything else.
  if (user.mustChangePassword && window.location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  if (permission && !can(permission)) return <p className="p-8">You do not have permission to see this page.</p>;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const home = user?.userType === 'SCHOOL' ? '/school' : '/';
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={home} replace /> : <Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route element={<Protected><Layout /></Protected>}>
        <Route path="/" element={user?.userType === 'SCHOOL' ? <Navigate to="/school" replace /> : <Dashboard />} />
        <Route path="/schools" element={<Protected permission="schools.view"><Schools /></Protected>} />
        <Route path="/activity-history" element={<Protected permission="activity.view"><ActivityHistory /></Protected>} />
        <Route path="/sessions" element={<Protected permission="schools.view"><Sessions /></Protected>} />
        <Route path="/subjects" element={<Protected permission="schools.view"><Subjects /></Protected>} />
        <Route path="/student-entries" element={<Protected permission="students.view"><StudentEntries /></Protected>} />
        <Route path="/student-register" element={<Protected permission="students.view"><StudentRegister /></Protected>} />
        <Route path="/school/students" element={<Protected permission="students.upload"><StudentEntries /></Protected>} />
        <Route path="/examiners" element={<Protected permission="examiners.review"><Examiners /></Protected>} />
        <Route path="/assign-examiners" element={<Protected permission="examiners.review"><AssignExaminers /></Protected>} />
        <Route path="/school/examiners" element={<Protected permission="examiners.nominate"><Examiners /></Protected>} />
        <Route path="/results" element={<Protected anyOf={RESULTS_ANY}><Results /></Protected>} />
        <Route path="/school/results" element={<Protected permission="school.portal"><Results /></Protected>} />
        <Route path="/announcements" element={<Protected><Announcements /></Protected>} />
        <Route path="/messages" element={<Protected permission="announcements.manage"><Messages /></Protected>} />
        <Route path="/reports" element={<Protected permission="reports.view"><Reports /></Protected>} />
        <Route path="/school/announcements" element={<Protected permission="school.portal"><Announcements /></Protected>} />
        <Route path="/school/messages" element={<Protected permission="school.portal"><Messages /></Protected>} />
        <Route path="/change-password" element={<ChangePassword />} />
        <Route path="/accounts" element={<Protected permission="users.manage"><Accounts /></Protected>} />
        <Route path="/school" element={<Protected permission="school.portal"><SchoolHome /></Protected>} />
        <Route path="*" element={<ComingSoon />} />
      </Route>
    </Routes>
  );
}
