import { z } from 'zod';
import { prisma } from '../db.js';
import { requirePermission, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';
import { csvEscape } from '../studentFile.js';

export const ANNOUNCEMENT_DEPARTMENTS = {
  administration: { label: 'Administration', roles: ['system_admin', 'exam_admin'] },
  registration: { label: 'Registration', roles: ['registration_officer', 'exam_admin'] },
  examiner_management: { label: 'Examiner management', roles: ['examiner_officer', 'exam_admin'] },
  results: { label: 'Results', roles: ['results_officer', 'results_approver', 'exam_admin'] },
  exam_setters: { label: 'Examination setters', roles: ['exam_setter', 'exam_admin'] },
  printing: { label: 'Printing', roles: ['printer', 'exam_admin'] },
};

export function announcementDepartmentKeys(roles = []) {
  return Object.entries(ANNOUNCEMENT_DEPARTMENTS)
    .filter(([, department]) => department.roles.some((role) => roles.includes(role)))
    .map(([key]) => key);
}

const announcementBody = z.object({
  title: z.string().trim().min(3, 'Enter a title.').max(150),
  body: z.string().trim().min(3, 'Enter the announcement.').max(5000),
  audience: z.enum(['GENERAL', 'DEPARTMENT', 'STAFF_DASHBOARD']).default('GENERAL'),
  departmentKey: z.string().optional(),
}).superRefine((announcement, ctx) => {
  if (announcement.audience === 'DEPARTMENT' && !Object.hasOwn(ANNOUNCEMENT_DEPARTMENTS, announcement.departmentKey || '')) {
    ctx.addIssue({ code: 'custom', message: 'Choose a department.', path: ['departmentKey'] });
  }
  if (announcement.audience !== 'DEPARTMENT' && announcement.departmentKey) {
    ctx.addIssue({ code: 'custom', message: 'A department can only be set for department announcements.', path: ['departmentKey'] });
  }
});
const messageBody = z.object({ subject: z.string().trim().min(3, 'Enter a subject.').max(150), body: z.string().trim().min(3, 'Enter your message.').max(5000) });

async function reportSummary(sessionId) {
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
  for (const candidate of cands) {
    bySchool[candidate.school.name] = (bySchool[candidate.school.name] || 0) + 1;
    gender[candidate.gender] = (gender[candidate.gender] || 0) + 1;
    for (const code of candidate.subjectCodes) bySubject[code] = (bySubject[code] || 0) + 1;
  }
  const batchInfo = await prisma.resultBatch.findMany({
    where: { id: { in: marks.map((mark) => mark.batchId) } },
    select: { id: true, subjectCode: true, paperCode: true, school: { select: { name: true } } },
  });
  const details = Object.fromEntries(batchInfo.map((batch) => [batch.id, batch]));
  const flat = (rows) => Object.fromEntries(rows.map((row) => [row.status, row._count]));
  return {
    session: { id: session.id, name: session.name, year: session.year, status: session.status },
    students: { total: cands.length, bySchool, bySubject, gender },
    entries: flat(subs), examinerRecommendations: flat(noms), resultBatches: flat(batches),
    marks: marks.map((mark) => ({
      subjectCode: details[mark.batchId].subjectCode,
      paperCode: details[mark.batchId].paperCode,
      schoolName: details[mark.batchId].school?.name || 'All schools',
      count: mark._count,
      average: mark._avg.mark == null ? null : Math.round(mark._avg.mark * 10) / 10,
      lowest: mark._min.mark,
      highest: mark._max.mark,
    })),
  };
}

export function registerCommunicationStaff(staff) {
  staff.get('/announcements', async (req, res, next) => {
    try {
      const departments = announcementDepartmentKeys(req.user.roles);
      const audienceFilter = [
        { audience: 'GENERAL' },
        { audience: 'STAFF_DASHBOARD' },
        ...(departments.length ? [{ audience: 'DEPARTMENT', departmentKey: { in: departments } }] : []),
      ];
      res.json({ items: await prisma.announcement.findMany({ where: { OR: audienceFilter }, orderBy: { createdAt: 'desc' }, take: 100 }) });
    } catch (e) { next(e); }
  });
  staff.post('/announcements', requirePermission('announcements.manage'), async (req, res, next) => {
    try {
      const b = announcementBody.parse(req.body);
      const a = await prisma.announcement.create({ data: { ...b, departmentKey: b.audience === 'DEPARTMENT' ? b.departmentKey : null, createdById: req.user.id } });
      await logActivity(req, 'announcements.sent', { entity: 'Announcement', entityId: a.id, after: { title: a.title, audience: a.audience, departmentKey: a.departmentKey } });
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
      res.json(await reportSummary(String(req.query.sessionId || '')));
    } catch (e) { next(e); }
  });
  staff.get('/reports/summary/export', requirePermission('reports.view'), async (req, res, next) => {
    try {
      const report = await reportSummary(String(req.query.sessionId || ''));
      const rows = [
        ['Report', `${report.session.name} ${report.session.year}`, '', '', '', ''],
        ['Section', 'Item', 'Count', 'Average mark', 'Lowest mark', 'Highest mark'],
        ['Students', 'Total approved students', report.students.total, '', '', ''],
        ...Object.entries(report.students.bySchool).map(([name, count]) => ['Students by school', name, count, '', '', '']),
        ...Object.entries(report.students.bySubject).map(([code, count]) => ['Students by subject', code, count, '', '', '']),
        ...Object.entries(report.students.gender).map(([gender, count]) => ['Students by gender', gender, count, '', '', '']),
        ...Object.entries(report.entries).map(([status, count]) => ['Student entries', status, count, '', '', '']),
        ...Object.entries(report.examinerRecommendations).map(([status, count]) => ['Examiner recommendations', status, count, '', '', '']),
        ...Object.entries(report.resultBatches).map(([status, count]) => ['Result batches', status, count, '', '', '']),
        ...report.marks.map((mark) => [
          'Approved or released marks',
          [mark.schoolName, mark.subjectCode, mark.paperCode].filter(Boolean).join(' — '),
          mark.count,
          mark.average,
          mark.lowest,
          mark.highest,
        ]),
      ];
      const csv = rows.map((row) => row.map(csvEscape).join(',')).join('\r\n') + '\r\n';
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="reports-${report.session.year}-${report.session.id}.csv"`);
      res.setHeader('Cache-Control', 'private, no-store');
      res.send(csv);
    } catch (e) { next(e); }
  });
}

export function registerCommunicationPortal(portal) {
  portal.get('/announcements', async (_req, res, next) => {
    try { res.json({ items: await prisma.announcement.findMany({ where: { audience: 'GENERAL' }, orderBy: { createdAt: 'desc' }, take: 100, select: { id: true, title: true, body: true, audience: true, createdAt: true } }) }); } catch (e) { next(e); }
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
