import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';
import { readStudentFile, validateRows, TEMPLATE_HEADERS, csvEscape } from '../studentFile.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });
const uploadFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'The file is too large. The limit is 5 MB.') : new HttpError(400, 'The file could not be uploaded.'));
});

const sendCsv = (res, name, lines) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
  res.send(lines.map((l) => l.map(csvEscape).join(',')).join('\r\n') + '\r\n');
};

async function validationContext(sessionId) {
  const [ss, groups, taken] = await Promise.all([
    prisma.sessionSubject.findMany({ where: { sessionId, subject: { isActive: true } }, include: { subject: true } }),
    prisma.subjectGroup.findMany({ include: { subjects: { include: { subject: true } } } }),
    prisma.candidate.findMany({ where: { sessionId }, select: { registrationNumber: true } }),
  ]);
  return {
    sessionSubjects: new Set(ss.map((x) => x.subject.code)),
    groups: groups.map((g) => ({ name: g.name, min: g.minSubjects, max: g.maxSubjects, codes: new Set(g.subjects.map((x) => x.subject.code)) })),
    takenNumbers: new Set(taken.map((c) => c.registrationNumber.toUpperCase())),
  };
}

const summary = (s) => ({ id: s.id, status: s.status, fileName: s.fileName, totalRecords: s.totalRecords, validRecords: s.validRecords,
  invalidRecords: s.invalidRecords, reviewNote: s.reviewNote, submittedAt: s.submittedAt, reviewedAt: s.reviewedAt,
  session: s.session && { id: s.session.id, name: s.session.name, year: s.session.year }, school: s.school && { id: s.school.id, name: s.school.name, code: s.school.code } });

// =========== School side: the school always comes from req.user.schoolId ===========
export function registerStudentPortal(portal) {
  portal.get('/sessions', async (_req, res, next) => {
    try { res.json({ items: await prisma.examinationSession.findMany({ where: { status: { not: 'PLANNED' } }, orderBy: { year: 'desc' }, include: { subjects: { include: { subject: { select: { code: true, name: true } } } } } }) }); } catch (e) { next(e); }
  });

  portal.get('/student-template', async (req, res, next) => {
    try {
      const sessionId = String(req.query.sessionId || '');
      const subjects = sessionId ? await prisma.sessionSubject.findMany({ where: { sessionId }, include: { subject: true } }) : [];
      const codes = subjects.map((s) => s.subject.code).slice(0, 3).join(';') || 'MATH;ENG;PHY';
      sendCsv(res, 'student-entries-template.csv', [TEMPLATE_HEADERS, ['STM/2026/001', 'Jane Example Doe', '2009-03-25', 'F', codes]]);
    } catch (e) { next(e); }
  });

  portal.post('/submissions', requirePermission('students.upload'), uploadFile, async (req, res, next) => {
    try {
      const { sessionId } = z.object({ sessionId: z.string().min(1, 'Choose an examination session.') }).parse(req.body);
      if (!req.file) throw new HttpError(400, 'Choose a file to upload.');
      const session = await prisma.examinationSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      if (session.status !== 'REGISTRATION_OPEN') throw new HttpError(400, 'Registration is not open for this session.');
      const schoolId = req.user.schoolId;
      const latest = await prisma.candidateSubmission.findFirst({ where: { schoolId, sessionId }, orderBy: { submittedAt: 'desc' } });
      if (latest && ['APPROVED', 'UNDER_REVIEW'].includes(latest.status))
        throw new HttpError(409, latest.status === 'APPROVED' ? 'Your student entries for this session are already approved and cannot be changed here.' : 'Your entries are being reviewed. Please wait for feedback before uploading again.');

      const rows = validateRows(await readStudentFile(req.file.buffer), await validationContext(sessionId));
      const invalid = rows.filter((r) => r.errors.length).length;
      const sub = await prisma.candidateSubmission.create({
        data: {
          schoolId, sessionId, fileName: req.file.originalname.slice(0, 200), submittedById: req.user.id,
          totalRecords: rows.length, validRecords: rows.length - invalid, invalidRecords: invalid,
          status: invalid ? 'CHANGES_REQUIRED' : 'SUBMITTED',
          reviewNote: invalid ? 'Some rows have errors. Please correct them and upload the file again.' : null,
          records: { create: rows.map((r) => ({ rowNumber: r.rowNumber, raw: r.data, errors: r.errors.length ? r.errors : undefined, isValid: r.errors.length === 0 })) },
        },
      });
      if (latest?.status === 'SUBMITTED' && !invalid)
        await prisma.candidateSubmission.update({ where: { id: latest.id }, data: { status: 'REJECTED', reviewNote: 'Replaced by a newer upload.' } });
      await logActivity(req, 'students.uploaded', { entity: 'CandidateSubmission', entityId: sub.id, after: { rows: rows.length, invalid } });
      res.status(201).json(summary(sub));
    } catch (e) { next(e); }
  });

  portal.get('/submissions', async (req, res, next) => {
    try {
      const items = await prisma.candidateSubmission.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { submittedAt: 'desc' }, include: { session: true } });
      res.json({ items: items.map(summary) });
    } catch (e) { next(e); }
  });

  portal.get('/submissions/:id', async (req, res, next) => {
    try {
      // The school filter is part of the query, so another school's ID simply is not found.
      const s = await prisma.candidateSubmission.findFirst({ where: { id: req.params.id, schoolId: req.user.schoolId }, include: { session: true } });
      if (!s) throw new HttpError(404, 'Submission not found.');
      const bad = await prisma.candidateSubmissionRecord.findMany({ where: { submissionId: s.id, isValid: false }, orderBy: { rowNumber: 'asc' }, take: 500 });
      res.json({ ...summary(s), errorRows: bad.map((r) => ({ rowNumber: r.rowNumber, data: r.raw, errors: r.errors })) });
    } catch (e) { next(e); }
  });
}

// =========== Staff side ===========
export function registerStudentStaff(staff) {
  staff.get('/submissions', requirePermission('students.view'), async (req, res, next) => {
    try {
      const where = {};
      if (req.query.status) where.status = String(req.query.status);
      if (req.query.sessionId) where.sessionId = String(req.query.sessionId);
      if (req.query.schoolId) where.schoolId = String(req.query.schoolId);
      const items = await prisma.candidateSubmission.findMany({ where, orderBy: { submittedAt: 'desc' }, take: 200, include: { session: true, school: true } });
      res.json({ items: items.map(summary) });
    } catch (e) { next(e); }
  });

  staff.get('/submissions/:id', requirePermission('students.view'), async (req, res, next) => {
    try {
      const s = await prisma.candidateSubmission.findUnique({ where: { id: req.params.id }, include: { session: true, school: true, records: { orderBy: { rowNumber: 'asc' }, take: 1000 } } });
      if (!s) throw new HttpError(404, 'Submission not found.');
      res.json({ ...summary(s), records: s.records.map((r) => ({ rowNumber: r.rowNumber, data: r.raw, errors: r.errors, isValid: r.isValid })) });
    } catch (e) { next(e); }
  });

  const move = (action, from, to, perm, needsNote) => staff.post(`/submissions/:id/${action}`, requirePermission(perm), async (req, res, next) => {
    try {
      const { note } = z.object({ note: needsNote ? z.string().min(3, 'Please explain why, so the school knows what to fix.') : z.string().optional() }).parse(req.body);
      const s = await prisma.candidateSubmission.findUnique({ where: { id: req.params.id } });
      if (!s) throw new HttpError(404, 'Submission not found.');
      if (!from.includes(s.status)) throw new HttpError(409, 'This entry is not in a state where that can be done.');
      const u = await prisma.candidateSubmission.update({ where: { id: s.id }, data: { status: to, reviewNote: note ?? null, reviewedById: req.user.id, reviewedAt: new Date() } });
      await logActivity(req, `students.${action}`, { entity: 'CandidateSubmission', entityId: s.id, before: { status: s.status }, after: { status: to, note } });
      res.json(summary(u));
    } catch (e) { next(e); }
  });
  move('start-review', ['SUBMITTED'], 'UNDER_REVIEW', 'students.review', false);
  move('return', ['SUBMITTED', 'UNDER_REVIEW'], 'CHANGES_REQUIRED', 'students.review', true);
  move('reject', ['SUBMITTED', 'UNDER_REVIEW'], 'REJECTED', 'students.approve', true);

  // Approval turns valid rows into official student records.
  staff.post('/submissions/:id/approve', requirePermission('students.approve'), async (req, res, next) => {
    try {
      const s = await prisma.candidateSubmission.findUnique({ where: { id: req.params.id }, include: { records: true } });
      if (!s) throw new HttpError(404, 'Submission not found.');
      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(s.status)) throw new HttpError(409, 'Only submitted entries can be approved.');
      if (s.invalidRecords > 0) throw new HttpError(409, 'This file still has rows with errors. Return it to the school to fix them.');
      const ctx = await validationContext(s.sessionId); // re-check at approval time
      const rows = validateRows(s.records.map((r) => ({ rowNumber: r.rowNumber, data: r.raw })), ctx);
      const clash = rows.filter((r) => r.errors.length);
      if (clash.length) throw new HttpError(409, `${clash.length} row(s) no longer pass the checks (for example a registration number was approved elsewhere). Return the entries to the school.`);
      await prisma.$transaction([
        prisma.candidate.createMany({ data: rows.map((r) => ({
          registrationNumber: r.data.registration_number.toUpperCase(), fullName: r.data.full_name, dateOfBirth: new Date(r.data.date_of_birth),
          gender: r.data.gender.toUpperCase(), schoolId: s.schoolId, sessionId: s.sessionId,
          subjectCodes: r.data.subjects.split(/[;|]/).map((c) => c.trim().toUpperCase()).filter(Boolean) })) }),
        prisma.candidateSubmission.update({ where: { id: s.id }, data: { status: 'APPROVED', reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: null } }),
      ]);
      await logActivity(req, 'students.approved', { entity: 'CandidateSubmission', entityId: s.id, after: { students: rows.length } });
      res.json({ ok: true, students: rows.length });
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A registration number in this file was approved in another entry. Return it to the school.') : e); }
  });

  // Official student register (internal only).
  staff.get('/candidates', requirePermission('students.view'), async (req, res, next) => {
    try {
      const p = Math.max(1, Number(req.query.page) || 1), size = Math.min(100, Number(req.query.pageSize) || 20);
      const q = String(req.query.q || '').trim();
      const where = {};
      if (req.query.sessionId) where.sessionId = String(req.query.sessionId);
      if (req.query.schoolId) where.schoolId = String(req.query.schoolId);
      if (q) where.OR = [{ fullName: { contains: q, mode: 'insensitive' } }, { registrationNumber: { contains: q, mode: 'insensitive' } }];
      const [items, total] = await Promise.all([
        prisma.candidate.findMany({ where, orderBy: { fullName: 'asc' }, skip: (p - 1) * size, take: size, include: { school: { select: { name: true, code: true } } } }),
        prisma.candidate.count({ where }),
      ]);
      res.json({ items, total, page: p, pageSize: size });
    } catch (e) { next(e); }
  });

  staff.get('/candidates/export', requirePermission('students.view'), async (req, res, next) => {
    try {
      const where = req.query.sessionId ? { sessionId: String(req.query.sessionId) } : {};
      const items = await prisma.candidate.findMany({ where, orderBy: { fullName: 'asc' }, include: { school: true } });
      await logActivity(req, 'students.register_exported', { entity: 'Candidate', after: { count: items.length } });
      sendCsv(res, 'student-register.csv', [['Registration number', 'Full name', 'Date of birth', 'Gender', 'School', 'Subjects'],
        ...items.map((c) => [c.registrationNumber, c.fullName, c.dateOfBirth?.toISOString().slice(0, 10), c.gender, c.school.name, c.subjectCodes.join(';')])]);
    } catch (e) { next(e); }
  });
}
