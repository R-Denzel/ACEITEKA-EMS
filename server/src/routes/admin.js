import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';

const optDate = z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).nullish().transform((v) => (v ? new Date(v) : null));

const sessionBody = z.object({
  name: z.string().min(3, 'Enter a name for the session, for example "End of Year Examinations".'),
  year: z.number({ invalid_type_error: 'Enter the year, for example 2026.' }).int().min(2000).max(2100),
  status: z.enum(['PLANNED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'EXAM_ONGOING', 'RESULTS_PROCESSING', 'COMPLETED']).optional(),
  registrationOpens: optDate, registrationCloses: optDate, examStarts: optDate, examEnds: optDate,
}).refine((d) => !d.registrationOpens || !d.registrationCloses || d.registrationCloses > d.registrationOpens,
  { message: 'Registration must close after it opens.', path: ['registrationCloses'] });

export function registerAdmin(staff) {
  // ----- Examination sessions -----
  staff.get('/sessions', requirePermission('schools.view'), async (_req, res, next) => {
    try { res.json({ items: await prisma.examinationSession.findMany({ orderBy: [{ year: 'desc' }, { name: 'asc' }], include: { subjects: { include: { subject: true } } } }) }); } catch (e) { next(e); }
  });

  staff.post('/sessions', requirePermission('sessions.manage'), async (req, res, next) => {
    try {
      const data = sessionBody.parse(req.body);
      const s = await prisma.examinationSession.create({ data });
      await logActivity(req, 'session.created', { entity: 'ExaminationSession', entityId: s.id, after: s });
      res.status(201).json(s);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A session with this name and year already exists.') : e); }
  });

  staff.patch('/sessions/:id', requirePermission('sessions.manage'), async (req, res, next) => {
    try {
      const before = await prisma.examinationSession.findUnique({ where: { id: req.params.id } });
      if (!before) throw new HttpError(404, 'Session not found.');
      const data = sessionBody.parse({ name: before.name, year: before.year, ...req.body });
      const s = await prisma.examinationSession.update({ where: { id: before.id }, data });
      await logActivity(req, 'session.updated', { entity: 'ExaminationSession', entityId: s.id, before, after: s });
      res.json(s);
    } catch (e) { next(e); }
  });

  staff.put('/sessions/:id/subjects', requirePermission('sessions.manage'), async (req, res, next) => {
    try {
      const { subjectIds } = z.object({ subjectIds: z.array(z.string()) }).parse(req.body);
      const id = req.params.id;
      if (!(await prisma.examinationSession.findUnique({ where: { id } }))) throw new HttpError(404, 'Session not found.');
      await prisma.$transaction([
        prisma.sessionSubject.deleteMany({ where: { sessionId: id } }),
        prisma.sessionSubject.createMany({ data: subjectIds.map((subjectId) => ({ sessionId: id, subjectId })) }),
      ]);
      await logActivity(req, 'session.subjects_changed', { entity: 'ExaminationSession', entityId: id, after: { subjectIds } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  // ----- Subjects and subject groups -----
  staff.get('/subjects', requirePermission('schools.view'), async (_req, res, next) => {
    try { res.json({ items: await prisma.subject.findMany({ orderBy: { code: 'asc' }, include: { papers: { orderBy: { number: 'asc' } } } }) }); } catch (e) { next(e); }
  });

  const papersBody = z.array(z.object({
    number: z.number().int().min(1).max(3),
    code: z.string().trim().min(1, 'Enter the paper code.').max(20).transform((value) => value.toUpperCase()),
  })).max(3, 'A subject can have up to three papers.')
    .superRefine((papers, ctx) => {
      if (new Set(papers.map((paper) => paper.number)).size !== papers.length) {
        ctx.addIssue({ code: 'custom', message: 'Choose each paper number only once.', path: [] });
      }
    });
  const subjectBody = z.object({
    code: z.string().min(2, 'Enter a subject code, for example MATH.').max(12).transform((s) => s.toUpperCase()),
    name: z.string().min(2, 'Enter the subject name.'),
    category: z.string().optional(),
    maxMark: z.number().int().min(1).max(1000).optional(),
    isActive: z.boolean().optional(),
    papers: papersBody.optional(),
  });
  staff.post('/subjects', requirePermission('subjects.manage'), async (req, res, next) => {
    try {
      const { papers = [], ...data } = subjectBody.parse(req.body);
      const s = await prisma.subject.create({ data: { ...data, papers: { create: papers } }, include: { papers: { orderBy: { number: 'asc' } } } });
      await logActivity(req, 'subject.created', { entity: 'Subject', entityId: s.id, after: s });
      res.status(201).json(s);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A subject or paper with this code already exists.') : e); }
  });
  staff.patch('/subjects/:id', requirePermission('subjects.manage'), async (req, res, next) => {
    try {
      const before = await prisma.subject.findUnique({ where: { id: req.params.id } });
      if (!before) throw new HttpError(404, 'Subject not found.');
      const parsed = subjectBody.partial().parse(req.body);
      const { papers, ...data } = parsed;
      const s = await prisma.$transaction(async (tx) => {
        if (papers) await tx.subjectPaper.deleteMany({ where: { subjectId: before.id } });
        return tx.subject.update({
          where: { id: before.id },
          data: { ...data, ...(papers ? { papers: { create: papers } } : {}) },
          include: { papers: { orderBy: { number: 'asc' } } },
        });
      });
      await logActivity(req, 'subject.updated', { entity: 'Subject', entityId: s.id, before, after: s });
      res.json(s);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A subject or paper with this code already exists.') : e); }
  });

  staff.get('/subject-groups', requirePermission('schools.view'), async (_req, res, next) => {
    try { res.json({ items: await prisma.subjectGroup.findMany({ orderBy: { name: 'asc' }, include: { subjects: { include: { subject: true } } } }) }); } catch (e) { next(e); }
  });
  const groupBody = z.object({
    name: z.string().min(2, 'Enter a name for the group, for example "Sciences".'),
    minSubjects: z.number().int().min(1), maxSubjects: z.number().int().min(1),
    subjectIds: z.array(z.string()).min(1, 'Choose at least one subject.'),
  }).refine((g) => g.maxSubjects >= g.minSubjects, { message: 'The most subjects allowed cannot be less than the fewest.', path: ['maxSubjects'] });
  staff.post('/subject-groups', requirePermission('subjects.manage'), async (req, res, next) => {
    try {
      const { subjectIds, ...g } = groupBody.parse(req.body);
      const group = await prisma.subjectGroup.create({ data: { ...g, subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } });
      await logActivity(req, 'subject_group.created', { entity: 'SubjectGroup', entityId: group.id, after: { ...g, subjectIds } });
      res.status(201).json(group);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A group with this name already exists.') : e); }
  });
  staff.put('/subject-groups/:id', requirePermission('subjects.manage'), async (req, res, next) => {
    try {
      const { subjectIds, ...g } = groupBody.parse(req.body);
      const before = await prisma.subjectGroup.findUnique({ where: { id: req.params.id }, include: { subjects: true } });
      if (!before) throw new HttpError(404, 'Group not found.');
      await prisma.$transaction([
        prisma.subjectGroupSubject.deleteMany({ where: { groupId: before.id } }),
        prisma.subjectGroup.update({ where: { id: before.id }, data: { ...g, subjects: { create: subjectIds.map((subjectId) => ({ subjectId })) } } }),
      ]);
      await logActivity(req, 'subject_group.updated', { entity: 'SubjectGroup', entityId: before.id,
        before: { name: before.name, min: before.minSubjects, max: before.maxSubjects, subjectIds: before.subjects.map((x) => x.subjectId) }, after: { ...g, subjectIds } });
      res.json({ ok: true });
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A group with this name already exists.') : e); }
  });
  staff.delete('/subject-groups/:id', requirePermission('subjects.manage'), async (req, res, next) => {
    try {
      await prisma.subjectGroup.delete({ where: { id: req.params.id } });
      await logActivity(req, 'subject_group.deleted', { entity: 'SubjectGroup', entityId: req.params.id });
      res.json({ ok: true });
    } catch (e) { next(e.code === 'P2025' ? new HttpError(404, 'Group not found.') : e); }
  });

  // ----- Examination centres -----
  staff.get('/centres', requirePermission('schools.view'), async (_req, res, next) => {
    try { res.json({ items: await prisma.examinationCentre.findMany({ orderBy: { code: 'asc' }, include: { _count: { select: { schools: true } } } }) }); } catch (e) { next(e); }
  });
  staff.post('/centres', requirePermission('schools.create'), async (req, res, next) => {
    try {
      const data = z.object({ code: z.string().min(2, 'Enter a centre code, for example C003.'), name: z.string().min(2, 'Enter the centre name.'), address: z.string().optional() }).parse(req.body);
      const c = await prisma.examinationCentre.create({ data });
      await logActivity(req, 'centre.created', { entity: 'ExaminationCentre', entityId: c.id, after: c });
      res.status(201).json(c);
    } catch (e) { next(e.code === 'P2002' ? new HttpError(409, 'A centre with this code already exists.') : e); }
  });

  // ----- School changes (switch on/off, move centre) -----
  staff.patch('/schools/:id', requirePermission('schools.update'), async (req, res, next) => {
    try {
      const data = z.object({ name: z.string().min(2).optional(), address: z.string().optional(), phone: z.string().optional(),
        email: z.string().email('Enter a valid email address.').optional(), isActive: z.boolean().optional(), centreId: z.string().nullable().optional() }).parse(req.body);
      const before = await prisma.school.findUnique({ where: { id: req.params.id } });
      if (!before) throw new HttpError(404, 'School not found.');
      const s = await prisma.school.update({ where: { id: before.id }, data });
      await logActivity(req, 'school.updated', { entity: 'School', entityId: s.id, before, after: s });
      res.json(s);
    } catch (e) { next(e); }
  });
}
