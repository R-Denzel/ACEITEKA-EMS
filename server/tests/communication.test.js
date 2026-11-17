import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://ebmis:ebmis_dev@localhost:5433/ebmis_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';

let request, prisma, session, app, sch1, sch2;
const A = {};
const O = () => process.env.CLIENT_URL;
const post = (agent, url, body = {}) => agent.post(url).set('Origin', O()).send(body);
async function login(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', O()).send({ email, password: 'Demo-Pass-2026' });
  assert.equal(r.status, 200, email);
  return agent;
}

before(async () => {
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
  request = (await import('supertest')).default;
  ({ prisma } = await import('../src/db.js'));
  const seed = await import('../prisma/seed.js');
  await seed.seedAccessControl(); await seed.seedDemo();
  app = (await import('../src/app.js')).createApp();
  session = await prisma.examinationSession.findFirstOrThrow({ where: { name: 'End of Year Examinations', year: 2026 } });
  sch1 = await prisma.school.findFirstOrThrow({ where: { code: 'SCH001' } });
  sch2 = await prisma.school.findFirstOrThrow({ where: { code: 'SCH002' } });
  await prisma.message.deleteMany({}); await prisma.announcement.deleteMany({});
  await prisma.resultCorrection.deleteMany({}); await prisma.resultDistributionSchool.deleteMany({}); await prisma.result.deleteMany({}); await prisma.resultBatch.deleteMany({});
  await prisma.candidate.deleteMany({ where: { sessionId: session.id } });
  const mk = (n, school, g, subjects) => ({ registrationNumber: n, fullName: `Student ${n}`, dateOfBirth: new Date('2009-01-01'), gender: g, schoolId: school.id, sessionId: session.id, subjectCodes: subjects });
  await prisma.candidate.createMany({ data: [mk('C1', sch1, 'F', ['MATH', 'ENG', 'PHY']), mk('C2', sch1, 'M', ['MATH', 'ENG', 'PHY']), mk('C3', sch2, 'M', ['MATH', 'ENG', 'HIST'])] });
  for (const [k, e] of Object.entries({ school1: 'school1@aceiteka.test', school2: 'school2@aceiteka.test', examadmin: 'examadmin@aceiteka.test', reg: 'registration@aceiteka.test', results: 'results@aceiteka.test', sysadmin: 'sysadmin@aceiteka.test' })) A[k] = await login(e);
});
after(async () => { await prisma.$disconnect(); });

test('announcements are limited to their selected audience and only general notices reach schools', async () => {
  assert.equal((await post(A.school1, '/api/announcements', { title: 'Hello', body: 'Everyone' })).status, 403);
  assert.equal((await post(A.reg, '/api/announcements', { title: 'Hello', body: 'Everyone' })).status, 403);
  assert.equal((await post(A.examadmin, '/api/announcements', { title: '', body: '' })).status, 400);
  assert.equal((await post(A.examadmin, '/api/announcements', { title: 'Bad department notice', body: 'Select a department.', audience: 'DEPARTMENT' })).status, 400);
  const general = await post(A.examadmin, '/api/announcements', { title: 'Registration closes Friday', body: 'Please upload your entries.' });
  const registration = await post(A.examadmin, '/api/announcements', {
    title: 'Registration team update', body: 'Review the pending entries.', audience: 'DEPARTMENT', departmentKey: 'registration',
  });
  const dashboard = await post(A.examadmin, '/api/announcements', {
    title: 'Staff dashboard notice', body: 'Internal operational update.', audience: 'STAFF_DASHBOARD',
  });
  assert.equal(general.status, 201);
  assert.equal(general.body.audience, 'GENERAL');
  assert.equal(registration.status, 201);
  assert.equal(dashboard.status, 201);
  for (const s of [A.school1, A.school2]) assert.equal((await s.get('/api/school-portal/announcements')).body.items.length, 1);
  const registrationFeed = await A.reg.get('/api/announcements');
  assert.equal(registrationFeed.status, 200);
  assert.deepEqual(registrationFeed.body.items.map((item) => item.id).sort(), [general.body.id, registration.body.id, dashboard.body.id].sort());
  const resultsFeed = await A.results.get('/api/announcements');
  assert.deepEqual(resultsFeed.body.items.map((item) => item.id).sort(), [general.body.id, dashboard.body.id].sort());
  assert.deepEqual((await A.reg.get('/api/dashboard')).body.dashboardAnnouncements.map((item) => item.id), [dashboard.body.id]);
  assert.equal((await request(app).get('/api/school-portal/announcements')).status, 401);
});

test('messages: school writes to ACEITEKA, and ACEITEKA replies to one school only', async () => {
  const m = await post(A.school1, '/api/school-portal/messages', { subject: 'Question', body: 'When are results out?', schoolId: sch2.id });
  assert.equal(m.status, 201);
  const stored = await prisma.message.findUniqueOrThrow({ where: { id: m.body.id } });
  assert.equal(stored.schoolId, sch1.id, 'school comes from the session, not the request');
  assert.equal(stored.fromSchool, true);
  assert.equal((await A.school2.get('/api/school-portal/messages')).body.items.length, 0);

  assert.equal((await post(A.school1, '/api/messages', { schoolId: sch1.id, subject: 'x', body: 'y' })).status, 403);
  assert.equal((await post(A.reg, '/api/messages', { schoolId: sch1.id, subject: 'Re: Question', body: 'Soon' })).status, 403);
  const reply = await post(A.examadmin, '/api/messages', { schoolId: sch1.id, subject: 'Re: Question', body: 'Results come after approval.' });
  assert.equal(reply.status, 201);

  const mine = await A.school1.get('/api/school-portal/messages');
  assert.equal(mine.body.items.length, 2); assert.equal(mine.body.unread, 1);
  assert.equal((await A.school2.get('/api/school-portal/messages')).body.unread, 0);
  assert.equal((await post(A.school2, `/api/school-portal/messages/${reply.body.id}/read`)).body.updated, 0, 'another school cannot mark it read');
  assert.equal((await post(A.school1, `/api/school-portal/messages/${reply.body.id}/read`)).body.updated, 1);
  assert.equal((await A.school1.get('/api/school-portal/messages')).body.unread, 0);
  assert.equal((await A.examadmin.get('/api/messages')).body.items.length, 2);
});

test('reports: counts for the chosen session, staff with reports permission only', async () => {
  const r = await A.examadmin.get(`/api/reports/summary?sessionId=${session.id}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.students.total, 3);
  assert.deepEqual(Object.values(r.body.students.bySchool).sort(), [1, 2]);
  assert.equal(r.body.students.bySubject.MATH, 3); assert.equal(r.body.students.gender.M, 2);
  const download = await A.examadmin.get(`/api/reports/summary/export?sessionId=${session.id}`);
  assert.equal(download.status, 200);
  assert.match(download.headers['content-type'], /text\/csv/);
  assert.match(download.headers['content-disposition'], /attachment/);
  assert.match(download.text, /Students by school/);
  assert.equal((await A.results.get(`/api/reports/summary/export?sessionId=${session.id}`)).status, 403);
  assert.equal((await A.examadmin.get('/api/reports/summary')).status, 400);
  assert.equal((await A.school1.get(`/api/reports/summary?sessionId=${session.id}`)).status, 403);
});

test('reports show mark averages only for approved or released results', async () => {
  const batch = await prisma.resultBatch.create({ data: { sessionId: session.id, subjectCode: 'MATH', enteredById: 'x', status: 'SUBMITTED_FOR_CHECK' } });
  const c = await prisma.candidate.findMany({ where: { sessionId: session.id } });
  await prisma.result.createMany({ data: c.map((x, i) => ({ batchId: batch.id, candidateId: x.id, mark: 50 + i * 10 })) });
  assert.equal((await A.examadmin.get(`/api/reports/summary?sessionId=${session.id}`)).body.marks.length, 0);
  await prisma.resultBatch.update({ where: { id: batch.id }, data: { status: 'APPROVED' } });
  const m = (await A.examadmin.get(`/api/reports/summary?sessionId=${session.id}`)).body.marks;
  assert.equal(m.length, 1); assert.equal(m[0].average, 60); assert.equal(m[0].lowest, 50); assert.equal(m[0].highest, 70);
  await prisma.result.deleteMany({ where: { batchId: batch.id } }); await prisma.resultBatch.delete({ where: { id: batch.id } });
});
