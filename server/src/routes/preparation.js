import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';

const materialDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'exam-materials');
const materialUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 2 } });
const uploadMaterials = (req, res, next) => materialUpload.fields([{ name: 'script', maxCount: 1 }, { name: 'guide', maxCount: 1 }])(req, res, (err) => {
  if (!err) return next();
  next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'Each examination document must be 20 MB or smaller.')
    : new HttpError(400, 'Upload one script and one marking guide.'));
});

const MILESTONE_TEMPLATE = [
  ['Confirm session subjects and school list', 'Check that the examination session and participating schools are complete.'],
  ['Collect student entries', 'Schools submit their student entry files before the registration deadline.'],
  ['Review student entries', 'Check submitted entries and return invalid files to schools for correction.'],
  ['Follow up outstanding schools', 'Send reminders to schools that have not submitted valid entries.'],
  ['Finalize approved student register', 'Approve the final entries before calculating printing quantities.'],
  ['Receive exam scripts and marking guides', 'Exam setters submit both documents for every subject.'],
  ['Review and approve examination materials', 'Check approved scripts and guides before releasing them to printing.'],
  ['Prepare and print examination scripts', 'Use the approved student counts and examination materials to prepare printing.'],
];

const milestoneBody = z.object({
  title: z.string().trim().min(3, 'Enter a milestone title.').max(150),
  description: z.string().trim().max(1000).optional().nullable(),
  dueAt: z.string().datetime({ offset: true }).nullable().optional(),
  assignedToId: z.string().nullable().optional(),
});
const requireAnyPermission = (...keys) => (req, _res, next) => {
  if (keys.some((key) => req.user?.permissions.has(key))) return next();
  next(new HttpError(403, 'You do not have permission to do this.'));
};

const materialSummary = (item) => ({
  id: item.id,
  sessionId: item.sessionId,
  session: item.session && { id: item.session.id, name: item.session.name, year: item.session.year },
  subjectCode: item.subjectCode,
  status: item.status,
  scriptName: item.scriptName,
  scriptSizeBytes: item.scriptSizeBytes,
  guideName: item.guideName,
  guideSizeBytes: item.guideSizeBytes,
  reviewNote: item.reviewNote,
  submittedAt: item.createdAt,
  reviewedAt: item.reviewedAt,
  submittedBy: item.submittedBy && { id: item.submittedBy.id, fullName: item.submittedBy.fullName },
});

function documentKind(file) {
  const name = file.originalname.toLowerCase();
  if (name.endsWith('.pdf') && file.buffer.subarray(0, 4).toString('latin1') === '%PDF') {
    return { ext: 'pdf', mime: 'application/pdf' };
  }
  if (name.endsWith('.docx') && file.buffer.length > 4 && file.buffer[0] === 0x50 && file.buffer[1] === 0x4b) {
    return { ext: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' };
  }
  return null;
}

async function sendMaterial(res, fileKey, fileName, mimeType) {
  let data;
  try { data = await fs.readFile(path.join(materialDir(), fileKey)); }
  catch { throw new HttpError(404, 'The examination document could not be found.'); }
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Content-Disposition', `attachment; filename="${fileName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
}

export function registerPreparationStaff(staff) {
  staff.get('/preparation/sessions', requireAnyPermission('pipeline.manage', 'entries.remind'), async (_req, res, next) => {
    try {
      const items = await prisma.examinationSession.findMany({ orderBy: [{ year: 'desc' }, { name: 'asc' }], select: { id: true, name: true, year: true, status: true } });
      res.json({ items });
    } catch (e) { next(e); }
  });

  staff.get('/preparation/staff', requirePermission('pipeline.manage'), async (_req, res, next) => {
    try {
      const items = await prisma.user.findMany({ where: { userType: 'STAFF', isActive: true }, orderBy: { fullName: 'asc' }, select: { id: true, fullName: true } });
      res.json({ items });
    } catch (e) { next(e); }
  });

  staff.get('/preparation/overview', requireAnyPermission('pipeline.manage', 'entries.remind'), async (req, res, next) => {
    try {
      const sessionId = String(req.query.sessionId || '');
      if (!sessionId) throw new HttpError(400, 'Choose an examination session.');
      const session = await prisma.examinationSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      const [milestones, schools, submissions, reminders] = await Promise.all([
        prisma.prepMilestone.findMany({ where: { sessionId }, orderBy: [{ dueAt: 'asc' }, { createdAt: 'asc' }], include: { assignedTo: { select: { id: true, fullName: true } } } }),
        prisma.school.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, code: true, name: true } }),
        prisma.candidateSubmission.findMany({ where: { sessionId }, orderBy: { submittedAt: 'desc' }, select: { id: true, schoolId: true, status: true, submittedAt: true, totalRecords: true, reviewNote: true } }),
        prisma.sessionSchoolReminder.findMany({ where: { sessionId }, select: { schoolId: true, lastSentAt: true, sentCount: true } }),
      ]);
      const latestBySchool = new Map();
      for (const submission of submissions) if (!latestBySchool.has(submission.schoolId)) latestBySchool.set(submission.schoolId, submission);
      const reminderBySchool = new Map(reminders.map((item) => [item.schoolId, item]));
      const now = Date.now();
      const items = schools.map((school) => {
        const submission = latestBySchool.get(school.id) || null;
        const reminder = reminderBySchool.get(school.id) || null;
        const outstanding = !submission || ['CHANGES_REQUIRED', 'REJECTED'].includes(submission.status);
        const recentReminder = reminder && now - reminder.lastSentAt.getTime() < 24 * 60 * 60 * 1000;
        return {
          ...school,
          submission: submission && { id: submission.id, status: submission.status, submittedAt: submission.submittedAt, totalRecords: submission.totalRecords, reviewNote: submission.reviewNote },
          reminder: reminder && { lastSentAt: reminder.lastSentAt, sentCount: reminder.sentCount },
          outstanding,
          reminderAvailable: outstanding && !recentReminder,
        };
      });
      res.json({ session: { id: session.id, name: session.name, year: session.year, status: session.status }, milestones, schools: items });
    } catch (e) { next(e); }
  });

  staff.post('/preparation/milestones/template', requirePermission('pipeline.manage'), async (req, res, next) => {
    try {
      const { sessionId } = z.object({ sessionId: z.string().min(1) }).parse(req.body);
      if (!await prisma.examinationSession.findUnique({ where: { id: sessionId } })) throw new HttpError(404, 'Examination session not found.');
      if (await prisma.prepMilestone.count({ where: { sessionId } })) throw new HttpError(409, 'This session already has preparation milestones.');
      await prisma.prepMilestone.createMany({ data: MILESTONE_TEMPLATE.map(([title, description]) => ({ sessionId, title, description })) });
      await logActivity(req, 'preparation.milestones_created', { entity: 'ExaminationSession', entityId: sessionId, after: { count: MILESTONE_TEMPLATE.length } });
      res.status(201).json({ ok: true, count: MILESTONE_TEMPLATE.length });
    } catch (e) { next(e); }
  });

  staff.post('/preparation/milestones', requirePermission('pipeline.manage'), async (req, res, next) => {
    try {
      const body = z.object({ sessionId: z.string().min(1) }).merge(milestoneBody).parse(req.body);
      if (!await prisma.examinationSession.findUnique({ where: { id: body.sessionId } })) throw new HttpError(404, 'Examination session not found.');
      if (body.assignedToId && !await prisma.user.findFirst({ where: { id: body.assignedToId, userType: 'STAFF', isActive: true } })) throw new HttpError(400, 'Choose an active staff member.');
      const item = await prisma.prepMilestone.create({ data: { ...body, dueAt: body.dueAt ? new Date(body.dueAt) : null } });
      await logActivity(req, 'preparation.milestone_created', { entity: 'PrepMilestone', entityId: item.id, after: { title: item.title, sessionId: item.sessionId } });
      res.status(201).json(item);
    } catch (e) { next(e); }
  });

  staff.patch('/preparation/milestones/:id', requirePermission('pipeline.manage'), async (req, res, next) => {
    try {
      const before = await prisma.prepMilestone.findUnique({ where: { id: req.params.id } });
      if (!before) throw new HttpError(404, 'Preparation milestone not found.');
      const body = z.object({
        title: milestoneBody.shape.title.optional(),
        description: milestoneBody.shape.description,
        dueAt: milestoneBody.shape.dueAt,
        assignedToId: milestoneBody.shape.assignedToId,
        status: z.enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'BLOCKED']).optional(),
      }).partial().parse(req.body);
      if (body.assignedToId && !await prisma.user.findFirst({ where: { id: body.assignedToId, userType: 'STAFF', isActive: true } })) throw new HttpError(400, 'Choose an active staff member.');
      const data = { ...body };
      if (Object.hasOwn(body, 'dueAt')) data.dueAt = body.dueAt ? new Date(body.dueAt) : null;
      if (body.status) data.completedAt = body.status === 'COMPLETED' ? new Date() : null;
      const item = await prisma.prepMilestone.update({ where: { id: before.id }, data });
      await logActivity(req, 'preparation.milestone_updated', { entity: 'PrepMilestone', entityId: item.id, before, after: item });
      res.json(item);
    } catch (e) { next(e); }
  });

  staff.post('/preparation/:sessionId/remind-missing', requirePermission('entries.remind'), async (req, res, next) => {
    try {
      const session = await prisma.examinationSession.findUnique({ where: { id: req.params.sessionId } });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      const [schools, submissions, reminders] = await Promise.all([
        prisma.school.findMany({ where: { isActive: true }, select: { id: true, name: true } }),
        prisma.candidateSubmission.findMany({ where: { sessionId: session.id }, orderBy: { submittedAt: 'desc' }, select: { schoolId: true, status: true } }),
        prisma.sessionSchoolReminder.findMany({ where: { sessionId: session.id }, select: { schoolId: true, lastSentAt: true } }),
      ]);
      const latestBySchool = new Map();
      for (const submission of submissions) if (!latestBySchool.has(submission.schoolId)) latestBySchool.set(submission.schoolId, submission);
      const recentBySchool = new Map(reminders.map((item) => [item.schoolId, item.lastSentAt]));
      const cutoff = Date.now() - 24 * 60 * 60 * 1000;
      const targets = schools.filter((school) => {
        const latest = latestBySchool.get(school.id);
        const outstanding = !latest || ['CHANGES_REQUIRED', 'REJECTED'].includes(latest.status);
        const lastSent = recentBySchool.get(school.id);
        return outstanding && (!lastSent || lastSent.getTime() < cutoff);
      });
      const now = new Date();
      for (const school of targets) {
        await prisma.$transaction(async (tx) => {
          await tx.message.create({
            data: {
              schoolId: school.id,
              fromSchool: false,
              senderId: req.user.id,
              subject: `Student entry reminder: ${session.name} ${session.year}`,
              body: `ACEITEKA has not received a complete student entry submission from ${school.name} for ${session.name} ${session.year}. Please sign in to the school portal, submit your entries, or correct and re-upload the file if changes were requested.`,
            },
          });
          await tx.sessionSchoolReminder.upsert({
            where: { sessionId_schoolId: { sessionId: session.id, schoolId: school.id } },
            create: { sessionId: session.id, schoolId: school.id, sentById: req.user.id, lastSentAt: now },
            update: { sentById: req.user.id, lastSentAt: now, sentCount: { increment: 1 } },
          });
        });
      }
      await logActivity(req, 'preparation.missing_school_reminders_sent', { entity: 'ExaminationSession', entityId: session.id, after: { sent: targets.length } });
      res.json({ sent: targets.length, message: targets.length ? `Sent reminders to ${targets.length} school${targets.length === 1 ? '' : 's'}.` : 'No reminders are due. Outstanding schools can be reminded again after 24 hours.' });
    } catch (e) { next(e); }
  });

  staff.get('/exam-materials', requirePermission('materials.review'), async (req, res, next) => {
    try {
      const where = {};
      if (req.query.sessionId) where.sessionId = String(req.query.sessionId);
      if (req.query.status) where.status = String(req.query.status);
      const items = await prisma.examMaterialSubmission.findMany({
        where, orderBy: { createdAt: 'desc' }, take: 200,
        include: { session: true, submittedBy: { select: { id: true, fullName: true } } },
      });
      res.json({ items: items.map(materialSummary) });
    } catch (e) { next(e); }
  });

  staff.patch('/exam-materials/:id/review', requirePermission('materials.review'), async (req, res, next) => {
    try {
      const body = z.object({ status: z.enum(['APPROVED', 'CHANGES_REQUIRED']), reviewNote: z.string().trim().max(2000).optional().default('') })
        .refine((value) => value.status !== 'CHANGES_REQUIRED' || value.reviewNote.length >= 3, { message: 'Explain what the setter needs to change.', path: ['reviewNote'] }).parse(req.body);
      const before = await prisma.examMaterialSubmission.findUnique({ where: { id: req.params.id } });
      if (!before) throw new HttpError(404, 'Examination material submission not found.');
      const item = await prisma.examMaterialSubmission.update({
        where: { id: before.id },
        data: { status: body.status, reviewNote: body.reviewNote || null, reviewedById: req.user.id, reviewedAt: new Date() },
        include: { session: true, submittedBy: { select: { id: true, fullName: true } } },
      });
      await logActivity(req, body.status === 'APPROVED' ? 'exam_materials.approved' : 'exam_materials.changes_requested', {
        entity: 'ExamMaterialSubmission', entityId: item.id, before: { status: before.status }, after: { status: item.status, subjectCode: item.subjectCode, sessionId: item.sessionId },
      });
      res.json(materialSummary(item));
    } catch (e) { next(e); }
  });

  staff.get('/exam-materials/:id/:kind', requirePermission('materials.review'), async (req, res, next) => {
    try {
      if (!['script', 'guide'].includes(req.params.kind)) throw new HttpError(404, 'Examination document not found.');
      const item = await prisma.examMaterialSubmission.findUnique({ where: { id: req.params.id } });
      if (!item) throw new HttpError(404, 'Examination material submission not found.');
      const isScript = req.params.kind === 'script';
      await sendMaterial(res, isScript ? item.scriptKey : item.guideKey, isScript ? item.scriptName : item.guideName, isScript ? item.scriptMimeType : item.guideMimeType);
    } catch (e) { next(e); }
  });
}

export function registerSetterPortal(staff) {
  staff.get('/setter/sessions', requirePermission('materials.submit'), async (_req, res, next) => {
    try {
      const items = await prisma.examinationSession.findMany({
        where: { status: { not: 'COMPLETED' } }, orderBy: [{ year: 'desc' }, { name: 'asc' }],
        include: { subjects: { include: { subject: { select: { code: true, name: true } } } } },
      });
      res.json({ items });
    } catch (e) { next(e); }
  });

  staff.get('/setter/materials', requirePermission('materials.submit'), async (req, res, next) => {
    try {
      const items = await prisma.examMaterialSubmission.findMany({
        where: { submittedById: req.user.id }, orderBy: { createdAt: 'desc' }, take: 100,
        include: { session: true },
      });
      res.json({ items: items.map(materialSummary) });
    } catch (e) { next(e); }
  });

  staff.post('/setter/materials', requirePermission('materials.submit'), uploadMaterials, async (req, res, next) => {
    const written = [];
    try {
      const body = z.object({ sessionId: z.string().min(1, 'Choose an examination session.'), subjectCode: z.string().trim().toUpperCase().min(1, 'Choose a subject.') }).parse(req.body);
      const files = req.files || {};
      const script = files.script?.[0];
      const guide = files.guide?.[0];
      if (!script || !guide) throw new HttpError(400, 'Upload both the exam script and marking guide.');
      const scriptKind = documentKind(script);
      const guideKind = documentKind(guide);
      if (!scriptKind) throw new HttpError(400, 'The exam script must be a valid PDF or DOCX file.');
      if (!guideKind) throw new HttpError(400, 'The marking guide must be a valid PDF or DOCX file.');
      const session = await prisma.examinationSession.findUnique({ where: { id: body.sessionId } });
      if (!session || session.status === 'COMPLETED') throw new HttpError(404, 'An open examination session was not found.');
      const offered = await prisma.sessionSubject.findFirst({ where: { sessionId: session.id, subject: { code: body.subjectCode } } });
      if (!offered) throw new HttpError(400, 'That subject is not offered in this examination session.');
      await fs.mkdir(materialDir(), { recursive: true });
      const scriptKey = `${crypto.randomUUID()}.${scriptKind.ext}`;
      const guideKey = `${crypto.randomUUID()}.${guideKind.ext}`;
      await fs.writeFile(path.join(materialDir(), scriptKey), script.buffer, { flag: 'wx' });
      written.push(scriptKey);
      await fs.writeFile(path.join(materialDir(), guideKey), guide.buffer, { flag: 'wx' });
      written.push(guideKey);
      const item = await prisma.examMaterialSubmission.create({
        data: {
          sessionId: session.id, subjectCode: body.subjectCode, submittedById: req.user.id,
          scriptKey, scriptName: script.originalname.slice(0, 200), scriptMimeType: scriptKind.mime, scriptSizeBytes: script.size,
          guideKey, guideName: guide.originalname.slice(0, 200), guideMimeType: guideKind.mime, guideSizeBytes: guide.size,
        },
        include: { session: true },
      });
      await logActivity(req, 'exam_materials.submitted', { entity: 'ExamMaterialSubmission', entityId: item.id, after: { sessionId: session.id, subjectCode: body.subjectCode } });
      res.status(201).json(materialSummary(item));
    } catch (e) {
      await Promise.all(written.map((key) => fs.unlink(path.join(materialDir(), key)).catch(() => {})));
      next(e);
    }
  });
}

export function registerPrinterPortal(staff) {
  staff.get('/printer/sessions', requirePermission('print.view'), async (_req, res, next) => {
    try {
      const items = await prisma.examinationSession.findMany({ orderBy: [{ year: 'desc' }, { name: 'asc' }], select: { id: true, name: true, year: true, status: true } });
      res.json({ items });
    } catch (e) { next(e); }
  });

  staff.get('/printer/dashboard', requirePermission('print.view'), async (req, res, next) => {
    try {
      const sessionId = String(req.query.sessionId || '');
      if (!sessionId) throw new HttpError(400, 'Choose an examination session.');
      const session = await prisma.examinationSession.findUnique({
        where: { id: sessionId },
        include: { subjects: { include: { subject: { select: { code: true, name: true } } } } },
      });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      const [candidates, materials] = await Promise.all([
        prisma.candidate.findMany({ where: { sessionId }, select: { subjectCodes: true } }),
        prisma.examMaterialSubmission.findMany({ where: { sessionId, status: 'APPROVED' }, orderBy: { createdAt: 'desc' }, include: { session: true } }),
      ]);
      const counts = new Map();
      for (const candidate of candidates) for (const code of new Set(candidate.subjectCodes)) counts.set(code, (counts.get(code) || 0) + 1);
      const subjects = session.subjects.map(({ subject }) => ({ ...subject, candidateCount: counts.get(subject.code) || 0 }));
      const latestMaterials = new Map();
      for (const item of materials) if (!latestMaterials.has(item.subjectCode)) latestMaterials.set(item.subjectCode, item);
      res.json({
        session: { id: session.id, name: session.name, year: session.year, status: session.status },
        totalApprovedStudents: candidates.length,
        subjects,
        materials: [...latestMaterials.values()].map(materialSummary),
      });
    } catch (e) { next(e); }
  });

  staff.get('/printer/materials/:id/:kind', requirePermission('print.view'), async (req, res, next) => {
    try {
      if (!['script', 'guide'].includes(req.params.kind)) throw new HttpError(404, 'Examination document not found.');
      const item = await prisma.examMaterialSubmission.findFirst({ where: { id: req.params.id, status: 'APPROVED' } });
      if (!item) throw new HttpError(404, 'Approved examination material not found.');
      const isScript = req.params.kind === 'script';
      await sendMaterial(res, isScript ? item.scriptKey : item.guideKey, isScript ? item.scriptName : item.guideName, isScript ? item.scriptMimeType : item.guideMimeType);
    } catch (e) { next(e); }
  });
}
