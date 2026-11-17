// Development seed data. DEMO PASSWORDS ARE FOR DEVELOPMENT ONLY - never use them in production.
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { prisma } from '../src/db.js';
import { PERMISSIONS, ROLES } from '../src/permissions.js';

export const DEMO_PASSWORD = 'Demo-Pass-2026';

export async function seedAccessControl() {
  for (const [key, description] of Object.entries(PERMISSIONS)) {
    await prisma.permission.upsert({ where: { key }, update: { description }, create: { key, description } });
  }
  for (const r of ROLES) {
    const role = await prisma.role.upsert({ where: { key: r.key }, update: { name: r.name, description: r.description, userType: r.userType }, create: { key: r.key, name: r.name, description: r.description, userType: r.userType } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    const perms = await prisma.permission.findMany({ where: { key: { in: r.permissions } } });
    await prisma.rolePermission.createMany({ data: perms.map((p) => ({ roleId: role.id, permissionId: p.id })) });
  }
}

async function makeUser(email, fullName, roleKey, schoolId) {
  const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const user = await prisma.user.upsert({
    where: { email },
    update: { passwordHash },
    create: { email, fullName, passwordHash, userType: role.userType, schoolId: schoolId ?? null },
  });
  await prisma.userRole.upsert({ where: { userId_roleId: { userId: user.id, roleId: role.id } }, update: {}, create: { userId: user.id, roleId: role.id } });
  return user;
}

export async function seedDemo() {
  const centre = await prisma.examinationCentre.upsert({ where: { code: 'C001' }, update: {}, create: { code: 'C001', name: 'Central Examination Centre' } });
  const centre2 = await prisma.examinationCentre.upsert({ where: { code: 'C002' }, update: {}, create: { code: 'C002', name: 'Northern Examination Centre' } });
  const a = await prisma.school.upsert({ where: { code: 'SCH001' }, update: {}, create: { code: 'SCH001', name: 'St. Mary Secondary School', centreId: centre.id, email: 'admin@stmary.example' } });
  const b = await prisma.school.upsert({ where: { code: 'SCH002' }, update: {}, create: { code: 'SCH002', name: 'Hillview High School', centreId: centre2.id, email: 'admin@hillview.example' } });

  const subjects = {};
  for (const [code, name] of [['MATH', 'Mathematics'], ['ENG', 'English'], ['PHY', 'Physics'], ['CHEM', 'Chemistry'], ['BIO', 'Biology'], ['HIST', 'History']]) {
    subjects[code] = await prisma.subject.upsert({ where: { code }, update: {}, create: { code, name } });
  }
  for (const [name, codes] of [['Sciences', ['MATH', 'ENG', 'PHY', 'CHEM', 'BIO']], ['Arts', ['MATH', 'ENG', 'HIST']]]) {
    if (!(await prisma.subjectGroup.findUnique({ where: { name } }))) {
      await prisma.subjectGroup.create({ data: { name, minSubjects: 3, maxSubjects: 5, subjects: { create: codes.map((c) => ({ subjectId: subjects[c].id })) } } });
    }
  }
  let session = await prisma.examinationSession.findFirst({ where: { name: 'End of Year Examinations', year: 2026 } });
  if (!session) {
    session = await prisma.examinationSession.create({ data: { name: 'End of Year Examinations', year: 2026, status: 'REGISTRATION_OPEN' } });
    await prisma.sessionSubject.createMany({ data: Object.values(subjects).map((s) => ({ sessionId: session.id, subjectId: s.id })) });
  }

  await makeUser('sysadmin@aceiteka.test', 'System Admin', 'system_admin');
  await makeUser('examadmin@aceiteka.test', 'Exam Admin', 'exam_admin');
  await makeUser('registration@aceiteka.test', 'Registration Officer', 'registration_officer');
  await makeUser('examiners@aceiteka.test', 'Examiner Officer', 'examiner_officer');
  await makeUser('results@aceiteka.test', 'Results Officer', 'results_officer');
  await makeUser('results2@aceiteka.test', 'Second Results Officer', 'results_officer');
  await makeUser('approver@aceiteka.test', 'Results Approver', 'results_approver');
  await makeUser('setter@aceiteka.test', 'Demo Exam Setter', 'exam_setter');
  await makeUser('printer@aceiteka.test', 'Demo Printing Officer', 'printer');
  await makeUser('school1@aceiteka.test', 'St. Mary Administrator', 'school_admin', a.id);
  await makeUser('school2@aceiteka.test', 'Hillview Administrator', 'school_admin', b.id);
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  await seedAccessControl();
  await seedDemo();
  console.log('Seeded roles, permissions and demo accounts (password for all demo accounts: ' + DEMO_PASSWORD + ')');
  await prisma.$disconnect();
}
