import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { authenticate, requirePermission, staffOnly, schoolOnly, HttpError } from '../middleware.js';
import { logActivity } from '../audit.js';
import { registerAdmin } from './admin.js';
import { registerStudentStaff, registerStudentPortal } from './students.js';
import { registerCommunicationStaff, registerCommunicationPortal } from './communication.js';
import { registerResultsStaff, registerResultsPortal } from './results.js';
import { registerExaminerStaff, registerExaminerPortal } from './examiners.js';
import { registerPreparationStaff, registerSetterPortal, registerPrinterPortal } from './preparation.js';

export const staffRouter = Router();
staffRouter.use(authenticate);

const page = (req) => {
  const p = Math.max(1, Number(req.query.page) || 1);
  const size = Math.min(100, Math.max(1, Number(req.query.pageSize) || 20));
  return { skip: (p - 1) * size, take: size, p, size };
};

// ---------- Staff area (internal ACEITEKA users only) ----------
const staff = Router();
staff.use(staffOnly);

staff.get('/schools', requirePermission('schools.view'), async (req, res, next) => {
  try {
    const { skip, take, p, size } = page(req);
    const q = String(req.query.q || '').trim();
    const where = q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { code: { contains: q, mode: 'insensitive' } }] } : {};
    const [items, total] = await Promise.all([
      prisma.school.findMany({ where, skip, take, orderBy: { name: 'asc' }, include: { centre: true } }),
      prisma.school.count({ where }),
    ]);
    res.json({ items, total, page: p, pageSize: size });
  } catch (e) { next(e); }
});

const schoolBody = z.object({
  code: z.string().min(2, 'Enter a school code, for example KPS001.').max(20),
  name: z.string().min(2, 'Enter the school name.'),
  address: z.string().optional(),
  email: z.string().email('Enter a valid email address.').optional().or(z.literal('')),
  phone: z.string().optional(),
  centreId: z.string().optional(),
});

staff.post('/schools', requirePermission('schools.create'), async (req, res, next) => {
  try {
    const data = schoolBody.parse(req.body);
    const exists = await prisma.school.findUnique({ where: { code: data.code } });
    if (exists) throw new HttpError(409, 'A school with this code already exists.');
    const school = await prisma.school.create({ data });
    await logActivity(req, 'school.created', { entity: 'School', entityId: school.id, after: school });
    res.status(201).json(school);
  } catch (e) { next(e); }
});

staff.get('/users', requirePermission('users.manage'), async (_req, res, next) => {
  try {
    const users = await prisma.user.findMany({ orderBy: { fullName: 'asc' },
      select: { id: true, email: true, fullName: true, userType: true, isActive: true, schoolId: true, roles: { select: { role: { select: { key: true, name: true } } } } } });
    res.json({ items: users });
  } catch (e) { next(e); }
});

staff.post('/users', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const body = z.object({
      email: z.string().email('Enter a valid email address.'),
      fullName: z.string().min(2, 'Enter the full name.'),
      password: z.string().min(10, 'Use at least 10 characters.').regex(/[0-9]/, 'Include a number.'),
      roleKey: z.string(),
      schoolId: z.string().optional(),
    }).parse(req.body);
    const role = await prisma.role.findUnique({ where: { key: body.roleKey } });
    if (!role) throw new HttpError(400, 'That role does not exist.');
    if (role.userType === 'SCHOOL' && !body.schoolId) throw new HttpError(400, 'Choose the school this account belongs to.');
    const user = await prisma.user.create({
      data: { email: body.email.toLowerCase(), fullName: body.fullName, passwordHash: await bcrypt.hash(body.password, 12),
        userType: role.userType, schoolId: role.userType === 'SCHOOL' ? body.schoolId : null, mustChangePassword: true,
        roles: { create: [{ roleId: role.id }] } },
    });
    await logActivity(req, 'user.created', { entity: 'User', entityId: user.id, after: { email: user.email, role: role.key } });
    res.status(201).json({ id: user.id, email: user.email });
  } catch (e) {
    if (e.code === 'P2002') return next(new HttpError(409, 'An account with this email already exists.'));
    next(e);
  }
});

staff.patch('/users/:id/active', requirePermission('users.manage'), async (req, res, next) => {
  try {
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);
    if (req.params.id === req.user.id) throw new HttpError(400, 'You cannot switch off your own account.');
    const user = await prisma.user.update({ where: { id: req.params.id }, data: { isActive } });
    await logActivity(req, isActive ? 'user.activated' : 'user.deactivated', { entity: 'User', entityId: user.id });
    res.json({ ok: true });
  } catch (e) { next(e); }
});

staff.get('/activity-history', requirePermission('activity.view'), async (req, res, next) => {
  try {
    const { skip, take, p, size } = page(req);
    const [items, total] = await Promise.all([
      prisma.activityLog.findMany({ skip, take, orderBy: { createdAt: 'desc' } }),
      prisma.activityLog.count(),
    ]);
    res.json({ items, total, page: p, pageSize: size });
  } catch (e) { next(e); }
});

staff.get('/dashboard', requirePermission('reports.view'), async (req, res, next) => {
  try {
    const [schools, sessions, candidates, pendingSubmissions, nominationsWaiting, resultsAwaiting, resultsReady, dashboardAnnouncements] = await Promise.all([
      prisma.school.count({ where: { isActive: true } }),
      prisma.examinationSession.count({ where: { status: { notIn: ['COMPLETED', 'PLANNED'] } } }),
      prisma.candidate.count(),
      prisma.candidateSubmission.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      prisma.examinerNomination.count({ where: { status: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
      prisma.resultBatch.count({ where: { status: 'SUBMITTED_FOR_APPROVAL' } }),
      prisma.resultBatch.count({ where: { status: 'APPROVED' } }),
      prisma.announcement.findMany({
        where: { audience: 'STAFF_DASHBOARD' },
        orderBy: { createdAt: 'desc' },
        take: 5,
      }),
    ]);
    res.json({ schools, activeSessions: sessions, approvedStudents: candidates, pendingSubmissions, nominationsWaiting, resultsAwaiting, resultsReady, dashboardAnnouncements });
  } catch (e) { next(e); }
});

// ---------- School portal: the school always comes from the signed-in account ----------
const portal = Router();
portal.use(schoolOnly);

portal.get('/profile', async (req, res, next) => {
  try {
    const school = await prisma.school.findUnique({ where: { id: req.user.schoolId }, include: { centre: true } });
    res.json(school);
  } catch (e) { next(e); }
});

portal.get('/summary', async (req, res, next) => {
  try {
    const schoolId = req.user.schoolId;
    const [submissionCounts, nominationCounts, distributionCount, unreadMessages, openSessions, approvedStudents] = await Promise.all([
      prisma.candidateSubmission.groupBy({ by: ['status'], where: { schoolId }, _count: true }),
      prisma.examinerNomination.groupBy({ by: ['status'], where: { schoolId }, _count: true }),
      prisma.resultDistributionSchool.count({ where: { schoolId } }),
      prisma.message.count({ where: { schoolId, fromSchool: false, readAt: null } }),
      prisma.examinationSession.count({ where: { status: { notIn: ['PLANNED', 'COMPLETED'] } } }),
      prisma.candidate.count({ where: { schoolId } }),
    ]);

    const totalSubmissions = submissionCounts.reduce((sum, item) => sum + item._count, 0);
    const pendingEntries = submissionCounts.filter((item) => ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED'].includes(item.status)).reduce((sum, item) => sum + item._count, 0);
    const pendingNominations = nominationCounts.filter((item) => ['SUBMITTED', 'UNDER_REVIEW', 'CHANGES_REQUIRED'].includes(item.status)).reduce((sum, item) => sum + item._count, 0);
    const resultsReady = distributionCount;

    res.json({
      schoolId,
      totalSubmissions,
      pendingEntries,
      pendingNominations,
      resultsReady,
      unreadMessages,
      openSessions,
      approvedStudents,
    });
  } catch (e) { next(e); }
});

registerAdmin(staff);
registerStudentStaff(staff);
registerStudentPortal(portal);
registerExaminerStaff(staff);
registerExaminerPortal(portal);
registerResultsStaff(staff);
registerResultsPortal(portal);
registerCommunicationStaff(staff);
registerCommunicationPortal(portal);
registerPreparationStaff(staff);
registerSetterPortal(staff);
registerPrinterPortal(staff);

// The portal must be mounted before the staff router, whose staff-only gate would otherwise catch every /api path.
staffRouter.use('/school-portal', portal);
staffRouter.use('/', staff);
