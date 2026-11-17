import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import 'dotenv/config';

process.env.NODE_ENV = 'test';
const testUploadDir = path.join(os.tmpdir(), `aceiteka-workflow-test-${process.pid}`);
process.env.UPLOAD_DIR = testUploadDir;
const testDatabaseUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
testDatabaseUrl.pathname = '/ebmis_test';
process.env.DATABASE_URL = testDatabaseUrl.toString();
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';

let request, prisma, session, agents;
const post = (agent, url, body) => agent.post(url).set('Origin', process.env.CLIENT_URL).send(body);

before(async () => {
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
  request = (await import('supertest')).default;
  ({ prisma } = await import('../src/db.js'));
  const seed = await import('../prisma/seed.js');
  await seed.seedAccessControl();
  await seed.seedDemo();
  const { createApp } = await import('../src/app.js');
  globalThis.__app = createApp();
  agents = {};
  for (const [name, email] of Object.entries({
    examadmin: 'examadmin@aceiteka.test',
    setter: 'setter@aceiteka.test',
    printer: 'printer@aceiteka.test',
    school: 'school1@aceiteka.test',
  })) {
    agents[name] = request.agent(globalThis.__app);
    await post(agents[name], '/api/auth/login', { email, password: seed.DEMO_PASSWORD });
  }
  const subject = await prisma.subject.findUniqueOrThrow({ where: { code: 'MATH' } });
  session = await prisma.examinationSession.create({
    data: {
      name: `Preparation Workflow Test ${Date.now()}`,
      year: 2098,
      status: 'PLANNED',
      subjects: { create: [{ subjectId: subject.id }] },
    },
  });
  const school = await prisma.school.findUniqueOrThrow({ where: { code: 'SCH001' } });
  await prisma.candidate.create({
    data: {
      registrationNumber: `PIPE-${Date.now()}`,
      fullName: 'Workflow Print Candidate',
      schoolId: school.id,
      sessionId: session.id,
      subjectCodes: ['MATH'],
    },
  });
});

after(async () => {
  if (prisma) await prisma.$disconnect();
  await fs.rm(testUploadDir, { recursive: true, force: true });
});

test('preparation milestones, missing-school reminders and printer materials follow role permissions', async () => {
  const template = await post(agents.examadmin, '/api/preparation/milestones/template', { sessionId: session.id });
  assert.equal(template.status, 201);
  assert.equal(template.body.count, 8);

  const overview = await agents.examadmin.get(`/api/preparation/overview?sessionId=${session.id}`);
  assert.equal(overview.status, 200);
  assert.equal(overview.body.milestones.length, 8);
  assert.ok(overview.body.schools.length >= 2);
  assert.ok(overview.body.schools.every((school) => school.outstanding));

  const reminders = await post(agents.examadmin, `/api/preparation/${session.id}/remind-missing`, {});
  assert.equal(reminders.status, 200);
  assert.equal(reminders.body.sent, overview.body.schools.length);
  const repeated = await post(agents.examadmin, `/api/preparation/${session.id}/remind-missing`, {});
  assert.equal(repeated.status, 200);
  assert.equal(repeated.body.sent, 0);
  const inbox = await agents.school.get('/api/school-portal/messages');
  assert.ok(inbox.body.items.some((message) => message.subject.includes(session.name)));

  const deniedSetterView = await agents.printer.get('/api/setter/materials');
  assert.equal(deniedSetterView.status, 403);
  const deniedPrinterUpload = await agents.printer.get('/api/printer/sessions');
  assert.equal(deniedPrinterUpload.status, 200);

  const upload = await agents.setter.post('/api/setter/materials')
    .set('Origin', process.env.CLIENT_URL)
    .field('sessionId', session.id)
    .field('subjectCode', 'MATH')
    .attach('script', Buffer.from('%PDF-1.4\nexam script'), { filename: 'math-paper.pdf', contentType: 'application/pdf' })
    .attach('guide', Buffer.from('%PDF-1.4\nmarking guide'), { filename: 'math-guide.pdf', contentType: 'application/pdf' });
  assert.equal(upload.status, 201, upload.body.error);
  const materialId = upload.body.id;
  assert.equal(upload.body.status, 'SUBMITTED');

  let print = await agents.printer.get(`/api/printer/dashboard?sessionId=${session.id}`);
  assert.equal(print.status, 200);
  assert.equal(print.body.totalApprovedStudents, 1);
  assert.equal(print.body.subjects.find((subject) => subject.code === 'MATH').candidateCount, 1);
  assert.equal(print.body.materials.length, 0);
  assert.equal((await agents.printer.get(`/api/printer/materials/${materialId}/script`)).status, 404);
  assert.equal((await agents.examadmin.get(`/api/exam-materials/${materialId}/script`)).status, 200);

  const approved = await agents.examadmin.patch(`/api/exam-materials/${materialId}/review`)
    .set('Origin', process.env.CLIENT_URL).send({ status: 'APPROVED' });
  assert.equal(approved.status, 200);
  print = await agents.printer.get(`/api/printer/dashboard?sessionId=${session.id}`);
  assert.equal(print.body.materials.length, 1);
  const downloaded = await agents.printer.get(`/api/printer/materials/${materialId}/guide`);
  assert.equal(downloaded.status, 200);
  assert.match(downloaded.headers['content-type'], /application\/pdf/);

  const unauthorizedChange = await agents.school.post(`/api/exam-materials/${materialId}/review`)
    .set('Origin', process.env.CLIENT_URL).send({ status: 'APPROVED' });
  assert.equal(unauthorizedChange.status, 403);
});
