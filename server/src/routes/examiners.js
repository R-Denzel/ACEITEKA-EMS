import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';

// Documents are kept on private disk storage, never in a public folder. They are only ever
// returned through the permission-checked routes below.
const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'examiner-documents');
const MAX_DOCS = 3;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: MAX_DOCS } });
const uploadDocs = (req, res, next) => upload.array('documents', MAX_DOCS)(req, res, (err) => {
  if (!err) return next();
  next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'A document is too large. The limit is 5 MB each.')
    : new HttpError(400, `The documents could not be uploaded. You can attach up to ${MAX_DOCS} files.`));
});

// File type comes from the content, not the file name.
export function sniffDocument(buf) {
  if (buf.length > 4 && buf.subarray(0, 4).toString('latin1') === '%PDF') return { ext: 'pdf', mime: 'application/pdf' };
  if (buf.length > 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  return null;
}

const nominationSchema = z.object({
  sessionId: z.string().min(1, 'Choose an examination session.'),
  fullName: z.string().trim().min(3, 'Enter the examiner\'s full name.').max(150),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.').optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  nationalId: z.string().trim().max(40).optional(),
  subjectCode: z.string().trim().toUpperCase().min(1, 'Choose a subject.'),
  qualifications: z.string().trim().min(3, 'Describe the examiner\'s qualifications.').max(2000),
  experience: z.string().trim().max(2000).optional(),
}).refine((d) => d.email || d.nationalId, { message: 'Enter a national ID or an email address, so we can recognise this person if they are recommended again.', path: ['nationalId'] });

const summary = (n) => ({
  id: n.id, status: n.status, fullName: n.fullName, email: n.email, phone: n.phone, nationalId: n.nationalId, subjectCode: n.subjectCode,
  qualifications: n.qualifications, experience: n.experience, reviewNote: n.reviewNote, createdAt: n.createdAt, reviewedAt: n.reviewedAt, profileId: n.profileId,
  session: n.session && { id: n.session.id, name: n.session.name, year: n.session.year },
  school: n.school && { id: n.school.id, name: n.school.name, code: n.school.code },
  documents: (n.documents || []).map((d) => ({ id: d.id, name: d.originalName, mimeType: d.mimeType, sizeBytes: d.sizeBytes })),
});
const include = { session: true, school: true, documents: true };

async function sendDocument(res, doc) {
  let data;
  try { data = await fs.readFile(path.join(uploadDir(), doc.storageKey)); } catch { throw new HttpError(404, 'The document file could not be found.'); }
  res.setHeader('Content-Type', doc.mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${doc.originalName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
}

// =========== School side: school always comes from req.user.schoolId ===========
export function registerExaminerPortal(portal) {
  portal.post('/nominations', requirePermission('examiners.nominate'), uploadDocs, async (req, res, next) => {
    const written = [];
    try {
      const body = nominationSchema.parse(req.body);
      const session = await prisma.examinationSession.findUnique({ where: { id: body.sessionId } });
      if (!session || session.status === 'PLANNED') throw new HttpError(404, 'Examination session not found.');
      if (session.status === 'COMPLETED') throw new HttpError(400, 'This examination session is closed.');
      const offered = await prisma.sessionSubject.findFirst({ where: { sessionId: session.id, subject: { code: body.subjectCode } } });
      if (!offered) throw new HttpError(400, 'That subject is not offered in this examination session.');

      const files = [];
      for (const f of req.files || []) {
        const kind = sniffDocument(f.buffer);
        if (!kind) throw new HttpError(400, `"${f.originalname}" is not a PDF, PNG or JPG file.`);
        files.push({ f, kind });
      }
      const schoolId = req.user.schoolId;
      const nomination = await prisma.examinerNomination.create({
        data: { schoolId, sessionId: session.id, fullName: body.fullName, email: body.email || null, phone: body.phone || null,
          nationalId: body.nationalId ? body.nationalId.toUpperCase() : null, subjectCode: body.subjectCode,
          qualifications: body.qualifications, experience: body.experience || null },
      });
      await fs.mkdir(uploadDir(), { recursive: true });
      for (const { f, kind } of files) {
        const storageKey = `${crypto.randomUUID()}.${kind.ext}`;
        await fs.writeFile(path.join(uploadDir(), storageKey), f.buffer, { flag: 'wx' });
        written.push(storageKey);
        await prisma.uploadedFile.create({ data: { storageKey, originalName: f.originalname.slice(0, 200), mimeType: kind.mime, sizeBytes: f.size, uploadedById: req.user.id, schoolId, nominationId: nomination.id } });
      }
      await logActivity(req, 'examiners.nominated', { entity: 'ExaminerNomination', entityId: nomination.id, after: { subject: body.subjectCode, documents: files.length } });
      res.status(201).json(summary(await prisma.examinerNomination.findUnique({ where: { id: nomination.id }, include })));
    } catch (e) { next(e); }
  });

  portal.get('/nominations', async (req, res, next) => {
    try {
      const items = await prisma.examinerNomination.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { createdAt: 'desc' }, include });
      res.json({ items: items.map((n) => { const s = summary(n); delete s.nationalId; delete s.profileId; return s; }) });
    } catch (e) { next(e); }
  });

  portal.get('/nominations/:id/documents/:docId', async (req, res, next) => {
    try {
      const doc = await prisma.uploadedFile.findFirst({ where: { id: req.params.docId, nominationId: req.params.id, schoolId: req.user.schoolId } });
      if (!doc) throw new HttpError(404, 'Document not found.');
      await sendDocument(res, doc);
    } catch (e) { next(e); }
  });
}

// =========== Staff side ===========
export function registerExaminerStaff(staff) {
  staff.get('/nominations', requirePermission('examiners.review'), async (req, res, next) => {
    try {
      const where = {};
      if (req.query.status) where.status = String(req.query.status);
      if (req.query.sessionId) where.sessionId = String(req.query.sessionId);
      if (req.query.schoolId) where.schoolId = String(req.query.schoolId);
      res.json({ items: (await prisma.examinerNomination.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200, include })).map(summary) });
    } catch (e) { next(e); }
  });

  staff.get('/nominations/:id', requirePermission('examiners.review'), async (req, res, next) => {
    try {
      const n = await prisma.examinerNomination.findUnique({ where: { id: req.params.id }, include });
      if (!n) throw new HttpError(404, 'Nomination not found.');
      res.json(summary(n));
    } catch (e) { next(e); }
  });

  staff.get('/nominations/:id/documents/:docId', requirePermission('examiners.review'), async (req, res, next) => {
    try {
      const doc = await prisma.uploadedFile.findFirst({ where: { id: req.params.docId, nominationId: req.params.id } });
      if (!doc) throw new HttpError(404, 'Document not found.');
      await logActivity(req, 'examiners.document_viewed', { entity: 'UploadedFile', entityId: doc.id });
      await sendDocument(res, doc);
    } catch (e) { next(e); }
  });

  const move = (action, from, to, perm, needsNote) => staff.post(`/nominations/:id/${action}`, requirePermission(perm), async (req, res, next) => {
    try {
      const { note } = z.object({ note: needsNote ? z.string().min(3, 'Please explain why, so the school knows what to fix.') : z.string().optional() }).parse(req.body);
      const n = await prisma.examinerNomination.findUnique({ where: { id: req.params.id } });
      if (!n) throw new HttpError(404, 'Nomination not found.');
      if (!from.includes(n.status)) throw new HttpError(409, 'This recommendation is not in a state where that can be done.');
      const u = await prisma.examinerNomination.update({ where: { id: n.id }, data: { status: to, reviewNote: note ?? null, reviewedById: req.user.id, reviewedAt: new Date() }, include });
      await logActivity(req, `examiners.${action}`, { entity: 'ExaminerNomination', entityId: n.id, before: { status: n.status }, after: { status: to, note } });
      res.json(summary(u));
    } catch (e) { next(e); }
  });
  move('start-review', ['SUBMITTED'], 'UNDER_REVIEW', 'examiners.review', false);
  move('return', ['SUBMITTED', 'UNDER_REVIEW'], 'CHANGES_REQUIRED', 'examiners.review', true);
  move('reject', ['SUBMITTED', 'UNDER_REVIEW'], 'REJECTED', 'examiners.approve', true);

  // Approving verifies the person and links (or creates) the central examiner record.
  // It deliberately does NOT assign the person to any marking work.
  staff.post('/nominations/:id/approve', requirePermission('examiners.approve'), async (req, res, next) => {
    try {
      const n = await prisma.examinerNomination.findUnique({ where: { id: req.params.id } });
      if (!n) throw new HttpError(404, 'Nomination not found.');
      if (!['SUBMITTED', 'UNDER_REVIEW'].includes(n.status)) throw new HttpError(409, 'Only submitted recommendations can be approved.');
      const profile = await prisma.$transaction(async (tx) => {
        let p = null;
        if (n.nationalId) p = await tx.examinerProfile.findUnique({ where: { nationalId: n.nationalId } });
        if (!p && n.email) p = await tx.examinerProfile.findFirst({ where: { email: n.email } });
        if (p) {
          p = await tx.examinerProfile.update({ where: { id: p.id }, data: {
            subjectCodes: Array.from(new Set([...p.subjectCodes, n.subjectCode])),
            nationalId: p.nationalId ?? n.nationalId, email: p.email ?? n.email, phone: p.phone ?? n.phone } });
        } else {
          p = await tx.examinerProfile.create({ data: { fullName: n.fullName, email: n.email, phone: n.phone, nationalId: n.nationalId, subjectCodes: [n.subjectCode], qualifications: n.qualifications } });
        }
        await tx.examinerNomination.update({ where: { id: n.id }, data: { status: 'APPROVED', profileId: p.id, reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: null } });
        return p;
      });
      await logActivity(req, 'examiners.approved', { entity: 'ExaminerNomination', entityId: n.id, after: { profileId: profile.id } });
      res.json({ ok: true, profileId: profile.id });
    } catch (e) { next(e); }
  });

  // ----- Verified examiner records -----
  staff.get('/examiner-profiles', requirePermission('examiners.review'), async (req, res, next) => {
    try {
      const q = String(req.query.q || '').trim();
      const where = q ? { OR: [{ fullName: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] } : {};
      res.json({ items: await prisma.examinerProfile.findMany({ where, orderBy: { fullName: 'asc' }, take: 200 }) });
    } catch (e) { next(e); }
  });

  // ----- Assigning examiners: a separate, deliberate step -----
  staff.get('/examiner-appointments', requirePermission('examiners.review'), async (req, res, next) => {
    try {
      const where = req.query.sessionId ? { sessionId: String(req.query.sessionId) } : {};
      res.json({ items: await prisma.examinerAppointment.findMany({ where, orderBy: { createdAt: 'desc' }, include: { profile: { select: { id: true, fullName: true, email: true } } } }) });
    } catch (e) { next(e); }
  });

  staff.post('/examiner-appointments', requirePermission('examiners.assign'), async (req, res, next) => {
    try {
      const b = z.object({
        profileId: z.string().min(1, 'Choose an examiner.'), sessionId: z.string().min(1, 'Choose an examination session.'),
        subjectCode: z.string().trim().toUpperCase().min(1, 'Choose a subject.'), role: z.string().trim().min(2).max(60).default('Examiner'),
      }).parse(req.body);
      const profile = await prisma.examinerProfile.findUnique({ where: { id: b.profileId } });
      if (!profile) throw new HttpError(404, 'Examiner not found.');
      if (!profile.subjectCodes.includes(b.subjectCode)) throw new HttpError(400, 'This examiner has not been approved for that subject.');
      const offered = await prisma.sessionSubject.findFirst({ where: { sessionId: b.sessionId, subject: { code: b.subjectCode } } });
      if (!offered) throw new HttpError(400, 'That subject is not offered in this examination session.');
      const a = await prisma.examinerAppointment.create({ data: { ...b, assignedById: req.user.id } });
      await logActivity(req, 'examiners.assigned', { entity: 'ExaminerAppointment', entityId: a.id, after: b });
      res.status(201).json(a);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'This examiner is already assigned to that subject in this session.') : e); }
  });

  staff.delete('/examiner-appointments/:id', requirePermission('examiners.assign'), async (req, res, next) => {
    try {
      const a = await prisma.examinerAppointment.findUnique({ where: { id: req.params.id } });
      if (!a) throw new HttpError(404, 'Assignment not found.');
      await prisma.examinerAppointment.delete({ where: { id: a.id } });
      await logActivity(req, 'examiners.unassigned', { entity: 'ExaminerAppointment', entityId: a.id, before: a });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });
}
