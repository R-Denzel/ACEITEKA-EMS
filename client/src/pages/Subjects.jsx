import { useEffect, useState } from 'react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';

export default function Subjects() {
  const { can } = useAuth();
  const [subjects, setSubjects] = useState([]);
  const [groups, setGroups] = useState([]);
  const [sub, setSub] = useState(null);
  const [grp, setGrp] = useState(null);
  const [errs, setErrs] = useState({});
  const [error, setError] = useState('');
  const load = () => Promise.all([api('/subjects'), api('/subject-groups')]).then(([s, g]) => { setSubjects(s.items); setGroups(g.items); }).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);
  const manage = can('subjects.manage');

  async function submit(path, body, done) {
    setErrs({}); setError('');
    try { await api(path, { method: body.id ? 'PUT' : 'POST', body }); done(); load(); } catch (err) { setErrs(err.fields || {}); if (!err.fields) setError(err.message); }
  }
  const toggle = async (s) => { try { await api(`/subjects/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } }); load(); } catch (e) { setError(e.message); } };
  const removeGroup = async (g) => { if (confirm(`Remove the group "${g.name}"? Schools will no longer be checked against it.`)) { await api(`/subject-groups/${g.id}`, { method: 'DELETE' }).catch((e) => setError(e.message)); load(); } };

  return (
    <>
      <PageHeader title="Subjects and Subject Groups" description="Subjects are what students are examined in. A subject group lists the subjects a student may take together. Student entries are checked against these groups." />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-navy">Subjects</h2>{manage && <button className="btn-primary" onClick={() => setSub({ code: '', name: '' })}>Add a subject</button>}</div>
          {sub && (
            <form className="card mb-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); submit('/subjects', sub, () => setSub(null)); }}>
              <label className="text-sm font-medium">Subject code *<input className="field mt-1" value={sub.code} onChange={(e) => setSub({ ...sub, code: e.target.value })} placeholder="For example MATH" /><span className="text-xs text-red-700">{errs.code}</span></label>
              <label className="text-sm font-medium">Subject name *<input className="field mt-1" value={sub.name} onChange={(e) => setSub({ ...sub, name: e.target.value })} /><span className="text-xs text-red-700">{errs.name}</span></label>
              <div className="flex gap-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={() => setSub(null)}>Cancel</button></div>
            </form>
          )}
          <div className="card overflow-x-auto p-0"><table className="w-full text-left text-sm"><tbody>
            {subjects.map((s) => (
              <tr key={s.id} className="border-b border-line last:border-0"><td className="p-3 font-mono">{s.code}</td><td className="p-3">{s.name}</td>
                <td className="p-3 text-right">{manage ? <button className="btn-ghost" onClick={() => toggle(s)}>{s.isActive ? 'Switch off' : 'Switch on'}</button> : (s.isActive ? 'Active' : 'Off')}</td></tr>
            ))}
            {subjects.length === 0 && <tr><td className="p-6 text-center text-slate">No subjects yet.</td></tr>}
          </tbody></table></div>
        </section>
        <section>
          <div className="mb-2 flex items-center justify-between"><h2 className="font-semibold text-navy">Subject groups</h2>{manage && <button className="btn-primary" onClick={() => setGrp({ name: '', minSubjects: 3, maxSubjects: 5, subjectIds: [] })}>Add a group</button>}</div>
          {grp && (
            <form className="card mb-3 grid gap-3" onSubmit={(e) => { e.preventDefault(); submit(grp.id ? `/subject-groups/${grp.id}` : '/subject-groups', grp, () => setGrp(null)); }}>
              <label className="text-sm font-medium">Group name *<input className="field mt-1" value={grp.name} onChange={(e) => setGrp({ ...grp, name: e.target.value })} placeholder="Sciences" /><span className="text-xs text-red-700">{errs.name}</span></label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-medium">Fewest subjects<input className="field mt-1" type="number" min="1" value={grp.minSubjects} onChange={(e) => setGrp({ ...grp, minSubjects: Number(e.target.value) })} /></label>
                <label className="text-sm font-medium">Most subjects<input className="field mt-1" type="number" min="1" value={grp.maxSubjects} onChange={(e) => setGrp({ ...grp, maxSubjects: Number(e.target.value) })} /><span className="text-xs text-red-700">{errs.maxSubjects}</span></label>
              </div>
              <fieldset><legend className="text-sm font-medium">Subjects in this group *</legend>
                <div className="mt-1 grid grid-cols-2 gap-1">{subjects.filter((s) => s.isActive).map((s) => (
                  <label key={s.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={grp.subjectIds.includes(s.id)} onChange={(e) => setGrp({ ...grp, subjectIds: e.target.checked ? [...grp.subjectIds, s.id] : grp.subjectIds.filter((x) => x !== s.id) })} />{s.code}</label>))}</div>
                <span className="text-xs text-red-700">{errs.subjectIds}</span></fieldset>
              <div className="flex gap-2"><button className="btn-primary">Save</button><button type="button" className="btn-ghost" onClick={() => setGrp(null)}>Cancel</button></div>
            </form>
          )}
          <div className="space-y-3">
            {groups.map((g) => (
              <div key={g.id} className="card flex items-start justify-between">
                <div><div className="font-semibold">{g.name}</div><div className="text-sm text-slate">{g.minSubjects} to {g.maxSubjects} subjects from: <span className="font-mono">{g.subjects.map((x) => x.subject.code).join(', ')}</span></div></div>
                {manage && <div className="flex gap-2"><button className="btn-ghost" onClick={() => setGrp({ id: g.id, name: g.name, minSubjects: g.minSubjects, maxSubjects: g.maxSubjects, subjectIds: g.subjects.map((x) => x.subjectId) })}>Edit</button><button className="btn-ghost" onClick={() => removeGroup(g)}>Remove</button></div>}
              </div>
            ))}
            {groups.length === 0 && <p className="text-sm text-slate">No groups yet. Until a group is added, any combination of the session's subjects is accepted.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
