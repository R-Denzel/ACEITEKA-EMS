import { useState } from 'react';
import { Link } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import { useAuth } from '../auth';

export default function Login() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError(''); setBusy(true);
    try { await login(email, password); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page p-4">
      <form onSubmit={submit} className="card w-full max-w-md space-y-4">
        <div className="flex items-center gap-2 text-navy"><GraduationCap /><span className="text-lg font-bold">ACEITEKA Examination System</span></div>
        <p className="text-sm text-slate">Sign in with the email and password given to you by ACEITEKA.</p>
        {error && <p role="alert" className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <label className="block text-sm font-medium">Email address
          <input className="field mt-1" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@school.org" />
        </label>
        <label className="block text-sm font-medium">Password
          <input className="field mt-1" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <button className="btn-primary w-full" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
        <Link to="/forgot-password" className="block text-center text-sm font-medium text-teal underline">Forgot your password?</Link>
      </form>
    </div>
  );
}
