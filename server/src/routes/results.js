import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';
import { parseCsv, sniffType, csvEscape } from '../studentFile.js';

// Chain: entered (SUBMITTED_FOR_CHECK) -> CHECKED -> APPROVED -> RELEASED to schools.
// Separation of duties: the person who entered cannot check or approve; the checker cannot approve.
export const MARK_MIN = 0, MARK_MAX = 100;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 1 } });
const uploadFile = (req, res, next) => upload.single('file')(req, res, (err) =>
  next(err ? new HttpError(400, err.code === 'LIMIT_FILE_SIZE' ? 'The file is too large. The limit is 2 MB.' : 'The file could not be uploaded.') : undefined));

const anyOf = (...keys) => (req, _res, next) =>
  keys.some((k) => req.user?.permissions.has(k)) ? next() : next(new HttpError(403, 'You do not have permission to do this.'));

const batchSummary = (b) => ({ id: b.id, status: b.status, subjectCode: b.subjectCode, note: b.note, createdAt: b.createdAt,
  checkedAt: b.checkedAt, approvedAt: b.approvedAt, releasedAt: b.releasedAt, enteredById: b.enteredById, checkedById: b.checkedById, approvedById: b.approvedById,
  session: b.session && { id: b.session.id, name: b.session.name, year: b.session.year },
  resultCount: b._count?.results, schoolsReleasedTo: b.distributions?.length });

/** Check an uploaded marks sheet against the official student register. Pure function, returns errors per row. */
export function validateMarks(rows, candidates) {
  const byReg = new Map(candidates.map((c) => [c.registrationNumber.toUpperCase(), c]));
  const seen = new Map(); const errors = []; const good = [];
  for (const { rowNumber, reg, mark } of rows) {
    const err = (message) => errors.push({ rowNumber, registrationNumber: reg, message });
    if (!reg) { err('Registration number is missing.'); continue; }
    const key = reg.toUpperCase();
    if (seen.has(key)) { err(`This registration number is also on row ${seen.get(key)}.`); continue; }
    seen.set(key, rowNumber);
    const cand = byReg.get(key);
    if (!cand) { err('This registration number is not an approved student taking this subject.'); continue; }
    if (mark === '') { err('The mark is missing.'); continue; }
    if (!/^\d{1,3}$/.test(mark) || Number(mark) < MARK_MIN || Number(mark) > MARK_MAX) { err(`The mark must be a whole number from ${MARK_MIN} to ${MARK_MAX}.`); continue; }
    good.push({ candidateId: cand.id, mark: Number(mark) });
  }
  for (const c of candidates) if (!seen.has(c.registrationNumber.toUpperCase()))
    errors.push({ rowNumber: null, registrationNumber: c.registrationNumber, message: 'This student is taking the subject but has no mark in the file.' });
  return { errors, good };
}

export function registerResultsStaff(staff) {
  const view = anyOf('results.enter', 'results.review', 'results.approve', 'results.release');

  staff.get('/result-batches', view, async (req, res, next) => {
    try {
      const where = {}; if (req.query.status) where.status = String(req.query.status); if (req.query.sessionId) where.sessionId = String(req.query.sessionId);
      const items = await prisma.resultBatch.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include: { session: true, distributions: true, _count: { select: { results: true } } } });
      res.json({ items: items.map(batchSummary) });
    } catch (e) { next(e); }
  });

  staff.get('/result-batches/:id', view, async (req, res, next) => {
    try {
      const b = await prisma.resultBatch.findUnique({ where: { id: req.params.id }, include: { session: true, distributions: { include: { school: { select: { name: true } } } }, results: { include: { candidate: { select: { registrationNumber: true, fullName: true, school: { select: { name: true } } } }, corrections: true }, orderBy: { candidate: { registrationNumber: 'asc' } } } } });
      if (!b) throw new HttpError(404, 'Results not found.');
      res.json({ ...batchSummary(b), distributions: b.distributions.map((d) => ({ school: d.school.name, releasedAt: d.releasedAt, firstViewedAt: d.firstViewedAt, downloadCount: d.downloadCount })),
        results: b.results.map((r) => ({ id: r.id, registrationNumber: r.candidate.registrationNumber, fullName: r.candidate.fullName, school: r.candidate.school.name, mark: r.mark, corrections: r.corrections })) });
    } catch (e) { next(e); }
  });

  // Enter results for one subject by uploading a CSV: registration_number,mark
  staff.post('/result-batches', requirePermission('results.enter'), uploadFile, async (req, res, next) => {
    try {
      const { sessionId, subjectCode } = z.object({ sessionId: z.string().min(1, 'Choose an examination session.'), subjectCode: z.string().trim().toUpperCase().min(1, 'Choose a subject.') }).parse(req.body);
      if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
      if (sniffType(req.file.buffer) !== 'csv') throw new HttpError(400, 'Please upload a CSV file with the columns registration_number and mark.');
      const rows = parseCsv(req.file.buffer.toString('utf8'));
      const header = (rows[0] || []).map((h) => h.trim().toLowerCase());
      const ri = header.indexOf('registration_number'), mi = header.indexOf('mark');
      if (ri < 0 || mi < 0) throw new HttpError(400, 'The file must have the columns registration_number and mark.');
      if (rows.length < 2) throw new HttpError(400, 'The file has no marks in it.');
      if (rows.length > 5001) throw new HttpError(400, 'The file has more than 5000 rows. Please split it.');

      const session = await prisma.examinationSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      if (!['EXAM_ONGOING', 'RESULTS_PROCESSING'].includes(session.status)) throw new HttpError(400, 'Results can only be entered once the examination has started and before the session is completed.');
      const existing = await prisma.resultBatch.findUnique({ where: { sessionId_subjectCode: { sessionId, subjectCode } } });
      if (existing && !['SUBMITTED_FOR_CHECK', 'CHANGES_REQUIRED', 'DRAFT'].includes(existing.status))
        throw new HttpError(409, 'These results are already checked or approved and can no longer be replaced. Use a correction for a single mark.');

      const candidates = (await prisma.candidate.findMany({ where: { sessionId, subjectCodes: { has: subjectCode } }, select: { id: true, registrationNumber: true } }));
      if (candidates.length === 0) throw new HttpError(400, 'No approved students take this subject in this session.');
      const { errors, good } = validateMarks(rows.slice(1).map((r, i) => ({ rowNumber: i + 2, reg: (r[ri] ?? '').trim(), mark: (r[mi] ?? '').trim() })), candidates);
      if (errors.length) return res.status(422).json({ error: `${errors.length} problem(s) found. Nothing was saved. Fix the file and upload it again.`, errors: errors.slice(0, 500) });

      const batch = await prisma.$transaction(async (tx) => {
        let b = existing;
        if (b) { await tx.result.deleteMany({ where: { batchId: b.id } }); b = await tx.resultBatch.update({ where: { id: b.id }, data: { status: 'SUBMITTED_FOR_CHECK', enteredById: req.user.id, note: null, checkedById: null, checkedAt: null } }); }
        else b = await tx.resultBatch.create({ data: { sessionId, subjectCode, enteredById: req.user.id, status: 'SUBMITTED_FOR_CHECK' } });
        await tx.result.createMany({ data: good.map((g) => ({ batchId: b.id, candidateId: g.candidateId, mark: g.mark })) });
        return b;
      });
      await logActivity(req, 'results.entered', { entity: 'ResultBatch', entityId: batch.id, after: { subjectCode, count: good.length } });
      res.status(201).json({ id: batch.id, status: batch.status, count: good.length });
    } catch (e) { next(e); }
  });

  const step = (action, from, to, perm, opts = {}) => staff.post(`/result-batches/:id/${action}`, requirePermission(perm), async (req, res, next) => {
    try {
      const { note } = z.object({ note: opts.needsNote ? z.string().min(3, 'Please explain why.') : z.string().optional() }).parse(req.body);
      const b = await prisma.resultBatch.findUnique({ where: { id: req.params.id } });
      if (!b) throw new HttpError(404, 'Results not found.');
      if (!from.includes(b.status)) throw new HttpError(409, 'These results are not in a state where that can be done.');
      if (opts.notEnterer && b.enteredById === req.user.id) throw new HttpError(403, 'You entered these results, so someone else must check and approve them.');
      if (opts.notChecker && b.checkedById === req.user.id) throw new HttpError(403, 'You checked these results, so someone else must approve them.');
      const data = { status: to, note: note ?? null, ...(opts.extra ? opts.extra(req.user.id) : {}) };
      const u = await prisma.resultBatch.update({ where: { id: b.id }, data, include: { session: true } });
      await logActivity(req, `results.${action}`, { entity: 'ResultBatch', entityId: b.id, before: { status: b.status }, after: { status: to, note } });
      res.json(batchSummary(u));
    } catch (e) { next(e); }
  });
  step('check', ['SUBMITTED_FOR_CHECK'], 'CHECKED', 'results.review', { notEnterer: true, extra: (id) => ({ checkedById: id, checkedAt: new Date() }) });
  step('return', ['SUBMITTED_FOR_CHECK', 'CHECKED'], 'CHANGES_REQUIRED', 'results.review', { needsNote: true, notEnterer: true });
  step('approve', ['CHECKED'], 'APPROVED', 'results.approve', { notEnterer: true, notChecker: true, extra: (id) => ({ approvedById: id, approvedAt: new Date() }) });
  step('reject', ['SUBMITTED_FOR_CHECK', 'CHECKED'], 'REJECTED', 'results.approve', { needsNote: true, notEnterer: true });

  // Send to schools: only now do schools gain access, and only to their own students.
  staff.post('/result-batches/:id/release', requirePermission('results.release'), async (req, res, next) => {
    try {
      const b = await prisma.resultBatch.findUnique({ where: { id: req.params.id } });
      if (!b) throw new HttpError(404, 'Results not found.');
      if (b.status !== 'APPROVED') throw new HttpError(409, 'Only approved results can be sent to schools.');
      const rows = await prisma.result.findMany({ where: { batchId: b.id }, select: { candidate: { select: { schoolId: true } } } });
      const schoolIds = [...new Set(rows.map((r) => r.candidate.schoolId))];
      await prisma.$transaction([
        prisma.resultDistributionSchool.createMany({ data: schoolIds.map((schoolId) => ({ batchId: b.id, schoolId })), skipDuplicates: true }),
        prisma.resultBatch.update({ where: { id: b.id }, data: { status: 'RELEASED', releasedById: req.user.id, releasedAt: new Date() } }),
      ]);
      await logActivity(req, 'results.released', { entity: 'ResultBatch', entityId: b.id, after: { schools: schoolIds.length } });
      res.json({ ok: true, schools: schoolIds.length });
    } catch (e) { next(e); }
  });

  // ----- Corrections to a single mark: requested by one person, approved by another -----
  staff.post('/result-corrections', requirePermission('results.enter'), async (req, res, next) => {
    try {
      const b = z.object({ resultId: z.string().min(1), newMark: z.number().int().min(MARK_MIN).max(MARK_MAX), reason: z.string().trim().min(5, 'Explain the reason for the correction.') }).parse(req.body);
      const r = await prisma.result.findUnique({ where: { id: b.resultId }, include: { batch: true } });
      if (!r) throw new HttpError(404, 'Result not found.');
      if (!['APPROVED', 'RELEASED'].includes(r.batch.status)) throw new HttpError(409, 'Corrections are for approved or released results. Before that, upload the file again.');
      const c = await prisma.resultCorrection.create({ data: { resultId: r.id, oldMark: r.mark, newMark: b.newMark, reason: b.reason, correctedById: req.user.id } });
      await logActivity(req, 'results.correction_requested', { entity: 'ResultCorrection', entityId: c.id, after: { old: r.mark, new: b.newMark } });
      res.status(201).json(c);
    } catch (e) { next(e); }
  });

  staff.get('/result-corrections', view, async (req, res, next) => {
    try { res.json({ items: await prisma.resultCorrection.findMany({ where: req.query.pending ? { approvedById: null } : {}, orderBy: { createdAt: 'desc' }, take: 200, include: { result: { include: { candidate: { select: { registrationNumber: true, fullName: true } }, batch: { select: { subjectCode: true } } } } } }) }); } catch (e) { next(e); }
  });

  staff.post('/result-corrections/:id/approve', requirePermission('results.approve'), async (req, res, next) => {
    try {
      const c = await prisma.resultCorrection.findUnique({ where: { id: req.params.id } });
      if (!c) throw new HttpError(404, 'Correction not found.');
      if (c.approvedById) throw new HttpError(409, 'This correction was already approved.');
      if (c.correctedById === req.user.id) throw new HttpError(403, 'You requested this correction, so someone else must approve it.');
      await prisma.$transaction([
        prisma.result.update({ where: { id: c.resultId }, data: { mark: c.newMark } }),
        prisma.resultCorrection.update({ where: { id: c.id }, data: { approvedById: req.user.id } }),
      ]);
      await logActivity(req, 'results.correction_approved', { entity: 'ResultCorrection', entityId: c.id, before: { mark: c.oldMark }, after: { mark: c.newMark } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}

// =========== School side: only released results, only the school's own students ===========
export function registerResultsPortal(portal) {
  const released = (req, batchId) => prisma.resultDistributionSchool.findFirst({ where: { batchId, schoolId: req.user.schoolId, batch: { status: 'RELEASED' } }, include: { batch: { include: { session: true } } } });
  const ownResults = (req, batchId) => prisma.result.findMany({ where: { batchId, candidate: { schoolId: req.user.schoolId } }, include: { candidate: { select: { registrationNumber: true, fullName: true } } }, orderBy: { candidate: { registrationNumber: 'asc' } } });

  portal.get('/results', async (req, res, next) => {
    try {
      const items = await prisma.resultDistributionSchool.findMany({ where: { schoolId: req.user.schoolId, batch: { status: 'RELEASED' } }, orderBy: { releasedAt: 'desc' }, include: { batch: { include: { session: true } } } });
      res.json({ items: items.map((d) => ({ batchId: d.batchId, subjectCode: d.batch.subjectCode, releasedAt: d.releasedAt, viewed: !!d.firstViewedAt, session: { name: d.batch.session.name, year: d.batch.session.year } })) });
    } catch (e) { next(e); }
  });

  portal.get('/results/:batchId', async (req, res, next) => {
    try {
      const d = await released(req, req.params.batchId);
      if (!d) throw new HttpError(404, 'Results not found.');
      if (!d.firstViewedAt) await prisma.resultDistributionSchool.update({ where: { id: d.id }, data: { firstViewedAt: new Date() } });
      const rows = await ownResults(req, d.batchId);
      res.json({ subjectCode: d.batch.subjectCode, session: { name: d.batch.session.name, year: d.batch.session.year }, releasedAt: d.releasedAt,
        results: rows.map((r) => ({ registrationNumber: r.candidate.registrationNumber, fullName: r.candidate.fullName, mark: r.mark })) });
    } catch (e) { next(e); }
  });

  portal.get('/results/:batchId/download', async (req, res, next) => {
    try {
      const d = await released(req, req.params.batchId);
      if (!d) throw new HttpError(404, 'Results not found.');
      await prisma.resultDistributionSchool.update({ where: { id: d.id }, data: { downloadCount: { increment: 1 }, firstViewedAt: d.firstViewedAt ?? new Date() } });
      const rows = await ownResults(req, d.batchId);
      await logActivity(req, 'results.downloaded', { entity: 'ResultBatch', entityId: d.batchId });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="results-${d.batch.subjectCode}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send([['Registration number', 'Full name', 'Mark'], ...rows.map((r) => [r.candidate.registrationNumber, r.candidate.fullName, r.mark])].map((l) => l.map(csvEscape).join(',')).join('\r\n') + '\r\n');
    } catch (e) { next(e); }
  });
}
