import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileImage, FileSpreadsheet, Plus, Upload } from 'lucide-react';
import { api } from '../api';
import { useAuth } from '../auth';
import PageHeader from '../components/PageHeader';
import StatusBadge from '../components/StatusBadge';

const clone = (value) => JSON.parse(JSON.stringify(value));

export default function OfficialEntries() {
  const { user, can } = useAuth();
  const isSchool = user.userType === 'SCHOOL';
  const canReview = !isSchool && can('students.review');
  const canApprove = !isSchool && can('students.approve');
  const canViewSource = isSchool || canReview || canApprove;
  const listUrl = isSchool ? '/school-portal/official-entry-imports' : '/official-entry-imports';
  const fileBase = isSchool ? '/api/school-portal/official-entry-imports' : '/api/official-entry-imports';
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState('');
  const [imports, setImports] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [file, setFile] = useState(null);
  const [schoolName, setSchoolName] = useState('');
  const [drafts, setDrafts] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const [schoolCodeDrafts, setSchoolCodeDrafts] = useState({});
  const [addingSchoolId, setAddingSchoolId] = useState('');
  const [returnNote, setReturnNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const selected = imports.find((item) => item.id === selectedId);
  const workbookSelected = file?.name.toLowerCase().endsWith('.xlsx');
  const allRecordsReviewed = !!selected?.records?.length && selected.records.every((record) => record.reviewedData);

  async function loadImports(preferredId = selectedId) {
    const data = await api(listUrl);
    setImports(data.items);
    if (preferredId && data.items.some((item) => item.id === preferredId)) setSelectedId(preferredId);
    else if (!data.items.some((item) => item.id === selectedId)) setSelectedId(data.items[0]?.id || '');
  }

  useEffect(() => {
    api(isSchool ? '/school-portal/sessions' : '/sessions')
      .then(({ items }) => {
        setSessions(items);
        const available = items.find((item) => item.status !== 'PLANNED');
        if (available) setSessionId(available.id);
      })
      .catch((err) => setError(err.message));
    loadImports('').catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selected) return;
    setDrafts(Object.fromEntries(selected.records.map((record) => [record.id, clone(record.reviewedData || record.extractedData)])));
    setConfirmed({});
  }, [selectedId, imports]);

  function updateRecord(id, update) {
    setDrafts((current) => ({ ...current, [id]: update(current[id]) }));
  }

  async function submitUpload(event) {
    event.preventDefault();
    setError(''); setNotice('');
    if (!file) return setError('Choose an official form photo or UACE workbook.');
    if (file.name.toLowerCase().endsWith('.xlsx') && isSchool) return setError('School accounts upload a photo of their own official form. Staff can import the UACE workbook.');
    if (!workbookSelected && !isSchool && !schoolName.trim()) return setError('Enter the school name shown on the photo.');
    const body = new FormData();
    body.append('sessionId', sessionId);
    body.append('file', file);
    if (!isSchool && schoolName.trim()) body.append('schoolName', schoolName.trim());
    setBusy(true);
    try {
      const response = await fetch(`/api${listUrl}`, { method: 'POST', body, credentials: 'include' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'The official form could not be uploaded.');
      setFile(null);
      event.target.reset();
      setNotice(`Form recognized. ${data.recordCount} school entr${data.recordCount === 1 ? 'y summary is' : 'y summaries are'} ready for human review.`);
      await loadImports(data.id);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveRecord(record) {
    setError(''); setNotice('');
    if (!confirmed[record.id]) return setError('Confirm that you cross-checked all subject and paper counts against the original form.');
    const draft = drafts[record.id];
    const reviewedData = {
      ...draft,
      subjects: draft.subjects.map((subject) => ({
        ...subject,
        papers: subject.papers.map((paper) => ({ ...paper, count: paper.count === '' || paper.count == null ? 0 : Number(paper.count) })),
      })),
    };
    setBusy(true);
    try {
      await api(`/official-entry-imports/${selected.id}/records/${record.id}`, { method: 'PATCH', body: reviewedData });
      await loadImports(selected.id);
      setNotice(`Reviewed totals saved for ${record.schoolName}.`);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function reviewImport(status) {
    setError(''); setNotice('');
    setBusy(true);
    try {
      const response = await api(`/official-entry-imports/${selected.id}/review`, {
        method: 'PATCH',
        body: status === 'APPROVED' ? { status } : { status, note: returnNote },
      });
      setImports((items) => items.map((item) => item.id === response.id ? response : item));
      setNotice(status === 'APPROVED' ? 'All reviewed entry summaries are now stored as approved softcopy records.' : 'The form was returned with your correction note.');
      setReturnNote('');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }

  async function addSchool(record) {
    setError(''); setNotice('');
    setAddingSchoolId(record.id);
    try {
      const result = await api(`/official-entry-imports/${selected.id}/records/${record.id}/school`, {
        method: 'POST',
        body: { code: schoolCodeDrafts[record.id] || '' },
      });
      await loadImports(selected.id);
      setNotice(`${result.school.name} was added to the school list and linked to this entry.`);
      setSchoolCodeDrafts((draftsByRecord) => ({ ...draftsByRecord, [record.id]: '' }));
    } catch (err) {
      setError(err.fields ? Object.values(err.fields).flat().join(' ') : err.message);
    } finally {
      setAddingSchoolId('');
    }
  }

  const selectedFileUrl = selected ? `${fileBase}/${selected.id}/file` : '';
  const formHeading = isSchool ? 'Submit official entry form' : 'Import official school entry forms';

  return (
    <>
      <PageHeader
        title={isSchool ? 'Official Entry Summary' : 'Official School Entry Forms'}
        description={isSchool
          ? 'Upload a clear photo of your official UCE or UACE entry summary. ACEITEKA will check the transcribed totals before they become official records.'
          : 'Upload official entry-form photos or the UACE workbook. Review every school and paper count against the source before approving the softcopy records.'}
      />
      {error && <p role="alert" className="mb-3 text-red-700">{error}</p>}
      {notice && <p role="status" className="mb-3 text-teal">{notice}</p>}

      <form onSubmit={submitUpload} className="card mb-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium">Examination session
          <select className="field mt-1" value={sessionId} onChange={(event) => setSessionId(event.target.value)} required>
            <option value="">Choose a session</option>
            {sessions.map((session) => <option key={session.id} value={session.id}>{session.name} {session.year}</option>)}
          </select>
        </label>
        {!isSchool && !workbookSelected && (
          <label className="text-sm font-medium">School name on photo
            <input className="field mt-1" value={schoolName} onChange={(event) => setSchoolName(event.target.value)} maxLength={200} required />
          </label>
        )}
        <label className={`text-sm font-medium ${isSchool ? 'sm:col-span-1' : 'sm:col-span-2'}`}>Official form photo (PNG/JPG) or UACE workbook (.xlsx), up to 10 MB
          <input className="field mt-1" type="file" accept=".png,.jpg,.jpeg,.xlsx,image/png,image/jpeg" onChange={(event) => setFile(event.target.files[0] || null)} required />
        </label>
        <p className="text-xs text-slate sm:col-span-2">Photo recognition identifies the official form layout. Handwritten counts must be entered or corrected and cross-checked by a person. The 2024 workbook importer reads only the ARTS and SCIENCES sheets; backup and checklist sheets are ignored.</p>
        <div className="sm:col-span-2"><button className="btn-primary" disabled={busy || !sessionId || !file}><Upload size={16} /> {busy ? 'Reading form…' : 'Upload and extract'}</button></div>
      </form>

      <div className="grid gap-6 lg:grid-cols-[minmax(16rem,0.8fr)_minmax(0,2fr)]">
        <section>
          <h2 className="mb-3 font-semibold text-navy">Submitted forms</h2>
          <div className="card space-y-2">
            {imports.map((item) => (
              <button key={item.id} type="button" onClick={() => setSelectedId(item.id)}
                className={`block w-full rounded-md border p-3 text-left ${selectedId === item.id ? 'border-teal bg-teal/5' : 'border-line'}`}>
                <span className="flex items-center gap-2 font-medium text-navy">{item.source === 'UACE_WORKBOOK' ? <FileSpreadsheet size={16} /> : <FileImage size={16} />}{item.formType.replace('_', ' ')}</span>
                <span className="mt-1 block text-xs text-slate">{item.formYear} · {item.recordCount} school(s) · {item.originalName}</span>
                <span className="mt-2 block"><StatusBadge status={item.status} /></span>
              </button>
            ))}
            {imports.length === 0 && <p className="text-sm text-slate">No official entry forms have been uploaded.</p>}
          </div>
        </section>

        {selected && (
          <section className="space-y-4">
            <div className="card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><h2 className="font-semibold text-navy">{selected.originalName}</h2><p className="mt-1 text-sm text-slate">{selected.session.name} {selected.session.year} · {selected.formType.replace('_', ' ')} · {selected.formYear}</p></div>
                <StatusBadge status={selected.status} />
              </div>
              {selected.reviewNote && <p className="mt-3 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{selected.reviewNote}</p>}
              {canViewSource && (selected.source === 'PHOTO'
                ? <img className="mt-4 max-h-[34rem] w-auto rounded border border-line object-contain" src={selectedFileUrl} alt="Uploaded official entry form for cross-checking" />
                : <a className="mt-3 inline-block text-sm font-medium text-teal underline" href={selectedFileUrl}>Download original workbook</a>)}
            </div>

            {selected.records.map((record) => {
              const draft = drafts[record.id];
              if (!draft) return null;
              const editable = canReview && selected.status !== 'APPROVED';
              return (
                <article key={record.id} className="card">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <h3 className="font-semibold text-navy">{record.schoolName || 'School name needs review'}</h3>
                    {record.reviewedData && <span className="flex items-center gap-1 text-sm font-medium text-green-800"><CheckCircle2 size={16} /> Cross-checked</span>}
                  </div>
                  {record.warnings?.map((warning) => <p key={warning} className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">{warning}</p>)}
                  {record.schoolId == null && !isSchool && (
                    <div className="mt-2 rounded-md bg-amber-50 p-3 text-sm text-amber-900">
                      <p>This school name does not yet match a school record. Confirm its identity before adding it.</p>
                      {canApprove && selected.status !== 'APPROVED' && record.reviewedData && (
                        <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); addSchool(record); }}>
                          <label className="min-w-48 text-xs font-medium">School code
                            <input className="field mt-1" required minLength={2} maxLength={20} value={schoolCodeDrafts[record.id] || ''} onChange={(event) => setSchoolCodeDrafts((draftsByRecord) => ({ ...draftsByRecord, [record.id]: event.target.value }))} placeholder="For example SCH003" />
                          </label>
                          <button className="btn-primary" disabled={addingSchoolId === record.id}><Plus size={16} /> {addingSchoolId === record.id ? 'Adding…' : 'Add school and link entry'}</button>
                        </form>
                      )}
                    </div>
                  )}
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <label className="text-sm font-medium">School name
                      <input className="field mt-1" value={draft.schoolName} disabled={!editable} onChange={(event) => updateRecord(record.id, (value) => ({ ...value, schoolName: event.target.value }))} />
                    </label>
                    <label className="text-sm font-medium">Centre name
                      <input className="field mt-1" value={draft.centreName || ''} disabled={!editable} onChange={(event) => updateRecord(record.id, (value) => ({ ...value, centreName: event.target.value }))} />
                    </label>
                    <label className="text-sm font-medium">Centre number
                      <input className="field mt-1" value={draft.centreNumber || ''} disabled={!editable} onChange={(event) => updateRecord(record.id, (value) => ({ ...value, centreNumber: event.target.value }))} />
                    </label>
                    <label className="text-sm font-medium">Total candidates
                      <input className="field mt-1" type="number" min="0" step="1" value={draft.totalCandidates ?? ''} disabled={!editable} onChange={(event) => updateRecord(record.id, (value) => ({ ...value, totalCandidates: event.target.value === '' ? null : Number(event.target.value) }))} />
                    </label>
                  </div>
                  <div className="mt-4 space-y-2">
                    {draft.subjects.map((subject, subjectIndex) => (
                      <details key={`${subject.code}-${subjectIndex}`} className="rounded-md border border-line p-3">
                        <summary className="cursor-pointer font-medium text-navy">{subject.code} · {subject.name}</summary>
                        <label className="mt-3 block max-w-xs text-sm font-medium">Subject entries
                          <input className="field mt-1" type="number" min="0" step="1" value={subject.entries ?? ''} disabled={!editable} onChange={(event) => updateRecord(record.id, (value) => ({ ...value, subjects: value.subjects.map((item, index) => index === subjectIndex ? { ...item, entries: event.target.value === '' ? null : Number(event.target.value) } : item) }))} />
                        </label>
                        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                          {subject.papers.map((paper, paperIndex) => (
                            <label key={paper.number} className="text-sm font-medium">Paper {paper.number}
                              <input className="field mt-1" type="number" min="0" step="1" value={paper.count ?? ''} disabled={!editable}
                                onChange={(event) => updateRecord(record.id, (value) => ({ ...value, subjects: value.subjects.map((item, index) => index === subjectIndex ? { ...item, papers: item.papers.map((entry, pIndex) => pIndex === paperIndex ? { ...entry, count: event.target.value === '' ? null : Number(event.target.value) } : entry) } : item) }))} />
                            </label>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                  {editable && (
                    <div className="mt-4">
                      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={!!confirmed[record.id]} onChange={(event) => setConfirmed((value) => ({ ...value, [record.id]: event.target.checked }))} />
                        <span>I cross-checked all subject and paper counts against the original official form. Blank photo cells represent zero entries.</span>
                      </label>
                      <button type="button" className="btn-primary mt-3" disabled={busy} onClick={() => saveRecord(record)}>Save reviewed summary</button>
                    </div>
                  )}
                </article>
              );
            })}

            {!isSchool && selected.status !== 'APPROVED' && (
              <div className="card flex flex-wrap items-end gap-3">
                {canApprove && <button type="button" className="btn-primary" disabled={busy || !allRecordsReviewed} onClick={() => reviewImport('APPROVED')}>Approve reviewed softcopy</button>}
                <label className="min-w-60 flex-1 text-sm font-medium">Return note
                  <input className="field mt-1" value={returnNote} onChange={(event) => setReturnNote(event.target.value)} placeholder="Explain what needs correction" />
                </label>
                {canReview && <button type="button" className="btn-ghost" disabled={busy || returnNote.trim().length < 3} onClick={() => reviewImport('CHANGES_REQUIRED')}>Return for correction</button>}
                {canApprove && !allRecordsReviewed && <p className="w-full text-xs text-slate">Save a cross-checked version of every school summary before approval.</p>}
              </div>
            )}
          </section>
        )}
      </div>
    </>
  );
}
