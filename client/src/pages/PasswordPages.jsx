import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

const RULE = 'Use at least 10 characters, with at least one letter and one number.';
const msg = (err) => (err.fields ? Object.values(err.fields).flat().join(' ') : err.message);

function Shell({ children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <div className="card w-full max-w-md space-y-4">
        <div className="flex items-center gap-3 text-navy"><img src="/aceiteka-logo.png" alt="ACEITEKA logo" className="h-14 w-14 rounded bg-white object-contain" /><span className="text-lg font-bold">ACEITEKA Examination System</span></div>
        {children}
      </div>
    </div>
  );
}

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    try { await api('/auth/forgot-password', { method: 'POST', body: { email } }); setSent(true); } catch (err) { setError(msg(err)); }
  }
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-navy">Forgot your password?</h1>
      {sent ? (
        <p role="status" className="rounded-md bg-teal/10 p-3 text-sm text-deep">If an account exists for that email, we have sent a link to choose a new password. The link works once and expires after 1 hour.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-slate">Enter the email address you sign in with.</p>
          {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <label className="block text-sm font-medium">Email address<input className="field mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
          <button className="btn-primary w-full">Send reset link</button>
        </form>
      )}
      <Link to="/login" className="block text-sm font-medium text-teal underline">Back to sign in</Link>
    </Shell>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const nav = useNavigate();
  const token = params.get('token') || '';
  const [pw, setPw] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError('');
    if (pw !== again) return setError('The two passwords are not the same.');
    try { await api('/auth/reset-password', { method: 'POST', body: { token, newPassword: pw } }); setDone(true); setTimeout(() => nav('/login'), 2500); } catch (err) { setError(msg(err)); }
  }
  return (
    <Shell>
      <h1 className="text-lg font-semibold text-navy">Choose a new password</h1>
      {!token ? <p role="alert" className="text-red-700">This link is not complete. Open the link from your email again, or ask for a new one.</p>
        : done ? <p role="status" className="rounded-md bg-teal/10 p-3 text-sm text-deep">Your password has been changed. Taking you to sign in…</p>
        : (
          <form onSubmit={submit} className="space-y-4">
            <p className="text-sm text-slate">{RULE}</p>
            {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            <label className="block text-sm font-medium">New password<input className="field mt-1" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></label>
            <label className="block text-sm font-medium">Type it again<input className="field mt-1" type="password" autoComplete="new-password" required value={again} onChange={(e) => setAgain(e.target.value)} /></label>
            <button className="btn-primary w-full">Change password</button>
          </form>
        )}
      <Link to="/login" className="block text-sm font-medium text-teal underline">Back to sign in</Link>
    </Shell>
  );
}

export function ChangePassword() {
  const { user, refresh } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', again: '' });
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(e) {
    e.preventDefault(); setError(''); setOk(false);
    if (form.newPassword !== form.again) return setError('The two new passwords are not the same.');
    try {
      await api('/auth/change-password', { method: 'POST', body: { currentPassword: form.currentPassword, newPassword: form.newPassword } });
      setOk(true); setForm({ currentPassword: '', newPassword: '', again: '' }); await refresh();
    } catch (err) { setError(msg(err)); }
  }
  return (
    <>
      <PageHeader title="Change Password" description={user.mustChangePassword ? 'For your safety, please choose your own password before you continue.' : 'Choose a new password for your account.'} />
      <form onSubmit={submit} className="card max-w-md space-y-4">
        <p className="text-sm text-slate">{RULE}</p>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {ok && <p role="status" className="rounded-md bg-teal/10 p-3 text-sm text-deep">Your password has been changed.</p>}
        <label className="block text-sm font-medium">Current password<input className="field mt-1" type="password" autoComplete="current-password" required value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></label>
        <label className="block text-sm font-medium">New password<input className="field mt-1" type="password" autoComplete="new-password" required value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></label>
        <label className="block text-sm font-medium">Type the new password again<input className="field mt-1" type="password" autoComplete="new-password" required value={form.again} onChange={(e) => setForm({ ...form, again: e.target.value })} /></label>
        <button className="btn-primary">Change password</button>
      </form>
    </>
  );
}
