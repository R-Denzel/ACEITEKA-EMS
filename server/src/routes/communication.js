import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';

const announcementBody = z.object({ title: z.string().trim().min(3, 'Enter a title.').max(150), body: z.string().trim().min(3, 'Enter the announcement.').max(5000) });
const messageBody = z.object({ subject: z.string().trim().min(3, 'Enter a subject.').max(150), body: z.string().trim().min(3, 'Enter your message.').max(5000) });

export function registerCommunicationStaff(staff) {
  // Announcements go to every school. Any staff member can read them; only announcers write.
  staff.get('/announcements', async (_req, res, next) => {
    try { res.json({ items: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100 }) }); } catch (e) { next(e); }
  });
  staff.post('/announcements', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const b = announcementBody.parse(req.body);
      const a = await prisma.announcement.create({ data: { ...b, createdById: req.user.id } });
      await logActivity(req, 'announcements.sent', { entity: 'Announcement', entityId: a.id, after: { title: a.title } });
      res.status(201).json(a);
    } catch (e) { next(e); }
  });
  staff.delete('/announcements/:id', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const a = await prisma.announcement.findUnique({ where: { id: req.params.id } });
      if (!a) throw new HttpError(404, 'Announcement not found.');
      await prisma.announcement.delete({ where: { id: a.id } });
      await logActivity(req, 'announcements.removed', { entity: 'Announcement', entityId: a.id, before: { title: a.title } });
      res.json({ ok: true });
    } catch (e) { next(e); }
  });

  staff.get('/messages', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const where = req.query.schoolId ? { schoolId: String(req.query.schoolId) } : {};
      const items = await prisma.message.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 });
      const schools = await prisma.school.findMany({ where: { id: { in: [...new Set(items.map((m) => m.schoolId))] } }, select: { id: true, name: true } });
      const name = Object.fromEntries(schools.map((s) => [s.id, s.name]));
      res.json({ items: items.map((m) => ({ ...m, schoolName: name[m.schoolId] })) });
    } catch (e) { next(e); }
  });
  staff.post('/messages', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const b = messageBody.extend({ schoolId: z.string().min(1, 'Choose a school.') }).parse(req.body);
      if (!await prisma.school.findUnique({ where: { id: b.schoolId } })) throw new HttpError(404, 'School not found.');
      const m = await prisma.message.create({ data: { ...b, fromSchool: false, senderId: req.user.id } });
      await logActivity(req, 'messages.sent', { entity: 'Message', entityId: m.id, after: { schoolId: b.schoolId } });
      res.status(201).json(m);
    } catch (e) { next(e); }
  });
  staff.post('/messages/:id/read', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const r = await prisma.message.updateMany({ where: { id: req.params.id, fromSchool: true, readAt: null }, data: { readAt: new Date() } });
      res.json({ ok: true, updated: r.count });
    } catch (e) { next(e); }
  });

  // Basic reports. All figures come from the database for the chosen session.
  staff.get('/reports/summary', requirePermission('reports.view'), async (req, res, next) => {
    try {
      const sessionId = String(req.query.sessionId || '');
      if (!sessionId) throw new HttpError(400, 'Choose an examination session.');
      const session = await prisma.examinationSession.findUnique({ where: { id: sessionId } });
      if (!session) throw new HttpError(404, 'Examination session not found.');
      const [cands, subs, noms, batches, marks] = await Promise.all([
        prisma.candidate.findMany({ where: { sessionId }, select: { gender: true, subjectCodes: true, school: { select: { name: true } } } }),
        prisma.candidateSubmission.groupBy({ by: ['status'], where: { sessionId }, _count: true }),
        prisma.examinerNomination.groupBy({ by: ['status'], where: { sessionId }, _count: true }),
        prisma.resultBatch.groupBy({ by: ['status'], where: { sessionId }, _count: true }),
        prisma.result.groupBy({ by: ['batchId'], where: { batch: { sessionId, status: { in: ['APPROVED', 'RELEASED'] } } }, _avg: { mark: true }, _min: { mark: true }, _max: { mark: true }, _count: true }),
      ]);
      const bySchool = {}, bySubject = {}, gender = { M: 0, F: 0 };
      for (const c of cands) {
        bySchool[c.school.name] = (bySchool[c.school.name] || 0) + 1;
        gender[c.gender] = (gender[c.gender] || 0) + 1;
        for (const s of c.subjectCodes) bySubject[s] = (bySubject[s] || 0) + 1;
      }
      const batchInfo = await prisma.resultBatch.findMany({ where: { id: { in: marks.map((m) => m.batchId) } }, select: { id: true, subjectCode: true } });
      const code = Object.fromEntries(batchInfo.map((b) => [b.id, b.subjectCode]));
      const flat = (rows) => Object.fromEntries(rows.map((r) => [r.status, r._count]));
      res.json({
        session: { id: session.id, name: session.name, year: session.year, status: session.status },
        students: { total: cands.length, bySchool, bySubject, gender },
        entries: flat(subs), examinerRecommendations: flat(noms), resultBatches: flat(batches),
        marks: marks.map((m) => ({ subjectCode: code[m.batchId], count: m._count, average: m._avg.mark == null ? null : Math.round(m._avg.mark * 10) / 10, lowest: m._min.mark, highest: m._max.mark })),
      });
    } catch (e) { next(e); }
  });
}

export function registerCommunicationPortal(portal) {
  portal.get('/announcements', async (_req, res, next) => {
    try { res.json({ items: await prisma.announcement.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, body: true, createdAt: true } }) }); } catch (e) { next(e); }
  });

  portal.get('/messages', async (req, res, next) => {
    try {
      const items = await prisma.message.findMany({ where: { schoolId: req.user.schoolId }, orderBy: { createdAt: 'desc' }, take: 200 });
      res.json({ items: items.map((m) => ({ id: m.id, subject: m.subject, body: m.body, fromSchool: m.fromSchool, readAt: m.readAt, createdAt: m.createdAt })), unread: items.filter((m) => !m.fromSchool && !m.readAt).length });
    } catch (e) { next(e); }
  });
  portal.post('/messages', async (req, res, next) => {
    try {
      const b = messageBody.parse(req.body);
      const m = await prisma.message.create({ data: { ...b, schoolId: req.user.schoolId, fromSchool: true, senderId: req.user.id } });
      await logActivity(req, 'messages.sent_to_aceiteka', { entity: 'Message', entityId: m.id });
      res.status(201).json({ id: m.id });
    } catch (e) { next(e); }
  });
  portal.post('/messages/:id/read', async (req, res, next) => {
    try {
      const r = await prisma.message.updateMany({ where: { id: req.params.id, schoolId: req.user.schoolId, fromSchool: false, readAt: null }, data: { readAt: new Date() } });
      res.json({ ok: true, updated: r.count });
    } catch (e) { next(e); }
  });
}
