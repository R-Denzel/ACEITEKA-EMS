import { useEffect, useState } from 'react';
import { api } from '../api';
import PageHeader from '../components/PageHeader';

const ROLES = [
  ['exam_admin', 'Examination Administrator'], ['registration_officer', 'Registration Officer'], ['examiner_officer', 'Examiner Management Officer'],
  ['results_officer', 'Results Officer'], ['results_approver', 'Results Approver'], ['system_admin', 'System Administrator'], ['school_admin', 'School Administrator (school account)'],
];

// A random one-time password the administrator passes on. The person must change it at first sign-in.
function tempPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('') + '7';
}

export default function Accounts() {
  const [users, setUsers] = useState([]);
  const [schools, setSchools] = useState([]);
  const [form, setForm] = useState(null);
  const [created, setCreated] = useState(null);
  const [error, setError] = useState('');
  const load = () => api('/users').then((d) => setUsers(d.items)).catch((e) => setError(e.message));
  useEffect(() => { load(); api('/schools?pageSize=100').then((d) => setSchools(d.items)).catch(() => {}); }, []);
  const schoolName = (id) => schools.find((s) => s.id === id)?.name || '';

  async function save(e) {
    e.preventDefault(); setError('');
    try {
      await api('/users', { method: 'POST', body: { ...form, schoolId: form.roleKey === 'school_admin' ? form.schoolId : undefined } });
      setCreated({ email: form.email, password: form.password }); setForm(null); load();
    } catch (err) { setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message); }
  }
  async function toggle(u) {
    try { await api(`/users/${u.id}/active`, { method: 'PATCH', body: { isActive: !u.isActive } }); load(); } catch (err) { setError(err.message); }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <>
      <PageHeader title="Staff and School Accounts" description="Create accounts for ACEITEKA staff and for schools, and switch accounts on or off. Everyone must choose their own password the first time they sign in.">
        <button className="btn-primary" onClick={() => { setCreated(null); setForm({ email: '', fullName: '', roleKey: 'registration_officer', schoolId: '', password: tempPassword() }); }}>Add an account</button>
      </PageHeader>
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {created && (
        <div role="status" className="card mb-6 border-teal">
          <p className="font-semibold text-navy">Account created for {created.email}</p>
          <p className="mt-1 text-sm">One-time password: <code className="rounded bg-page px-2 py-1 font-mono">{created.password}</code></p>
          <p className="mt-1 text-sm text-slate">Give this to the person in a private message. It is shown only now and cannot be looked up later.</p>
          <button className="btn-ghost mt-2" onClick={() => setCreated(null)}>Done</button>
        </div>
      )}
      {form && (
        <form onSubmit={save} className="card mb-6 grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-medium">Full name<input className="field mt-1" value={form.fullName} onChange={set('fullName')} required /></label>
          <label className="text-sm font-medium">Email address<input className="field mt-1" type="email" value={form.email} onChange={set('email')} required /></label>
          <label className="text-sm font-medium">Role<select className="field mt-1" value={form.roleKey} onChange={set('roleKey')}>{ROLES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          {form.roleKey === 'school_admin' && (
            <label className="text-sm font-medium">School<select className="field mt-1" value={form.schoolId} onChange={set('schoolId')} required><option value="">Choose a school</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
          )}
          <label className="text-sm font-medium sm:col-span-2">One-time password<div className="mt-1 flex gap-2"><input className="field font-mono" value={form.password} onChange={set('password')} required /><button type="button" className="btn-ghost" onClick={() => setForm({ ...form, password: tempPassword() })}>New one</button></div></label>
          <div className="flex gap-2 sm:col-span-2"><button className="btn-primary">Create account</button><button type="button" className="btn-ghost" onClick={() => setForm(null)}>Cancel</button></div>
        </form>
      )}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-line bg-page text-slate"><tr><th className="p-3">Name</th><th className="p-3">Email</th><th className="p-3">Role</th><th className="p-3">School</th><th className="p-3">Status</th><th className="p-3"></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-line last:border-0"><td className="p-3">{u.fullName}</td><td className="p-3">{u.email}</td><td className="p-3">{u.roles.map((r) => r.role.name).join(', ')}</td><td className="p-3">{schoolName(u.schoolId) || '-'}</td>
                <td className="p-3">{u.isActive ? 'Active' : 'Switched off'}</td><td className="p-3"><button className="btn-ghost" onClick={() => toggle(u)}>{u.isActive ? 'Switch off' : 'Switch on'}</button></td></tr>))}
          </tbody>
        </table>
      </div>
    </>
  );
}
