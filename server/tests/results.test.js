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
const csv = (rows) => Buffer.from(['registration_number,mark', ...rows].join('\n'));
const enter = (agent, buf, subjectCode = 'MATH') => agent.post('/api/result-batches').set('Origin', O()).field('sessionId', session.id).field('subjectCode', subjectCode).attach('file', buf, 'marks.csv');

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
  await prisma.examinationSession.update({ where: { id: session.id }, data: { status: 'EXAM_ONGOING' } });
  await prisma.resultCorrection.deleteMany({}); await prisma.resultDistributionSchool.deleteMany({}); await prisma.result.deleteMany({});
  await prisma.resultBatch.deleteMany({}); await prisma.candidate.deleteMany({ where: { sessionId: session.id } });
  const mk = (n, school, subjects) => ({ registrationNumber: n, fullName: `Student ${n}`, dateOfBirth: new Date('2009-01-01'), gender: 'F', schoolId: school.id, sessionId: session.id, subjectCodes: subjects });
  await prisma.candidate.createMany({ data: [mk('R1', sch1, ['MATH', 'ENG', 'PHY']), mk('R2', sch1, ['MATH', 'ENG', 'PHY']), mk('R3', sch2, ['MATH', 'ENG', 'PHY']), mk('R4', sch2, ['ENG', 'PHY', 'CHEM'])] });
  for (const [k, e] of Object.entries({ school1: 'school1@aceiteka.test', school2: 'school2@aceiteka.test', enterer: 'results@aceiteka.test', other: 'results2@aceiteka.test', approver: 'approver@aceiteka.test', reg: 'registration@aceiteka.test' })) A[k] = await login(e);
});
after(async () => { await prisma.$disconnect(); });

let batch;
test('marks are validated: missing, out of range, duplicate, unknown student, student without a mark', async () => {
  const bad = await enter(A.enterer, csv(['R1,105', 'R1,50', 'R2,', 'ZZZ,40']));
  assert.equal(bad.status, 422);
  const m = JSON.stringify(bad.body.errors);
  assert.match(m, /whole number from 0 to 100/); assert.match(m, /also on row 2/); assert.match(m, /mark is missing/);
  assert.match(m, /not an approved student taking this subject/); assert.match(m, /R3/);
  assert.equal(await prisma.resultBatch.count(), 0, 'nothing saved on error');
  assert.equal((await enter(A.enterer, csv(['R1,50']), 'HIST')).status, 400, 'no students take HIST');
});

test('staff without enter permission, and schools, cannot enter results', async () => {
  assert.equal((await enter(A.approver, csv(['R1,50']))).status, 403);
  assert.equal((await enter(A.school1, csv(['R1,50']))).status, 403);
});

test('valid marks are saved and wait for checking', async () => {
  const r = await enter(A.enterer, csv(['R1,70', 'R2,55', 'R3,88']));
  assert.equal(r.status, 201); assert.equal(r.body.status, 'SUBMITTED_FOR_CHECK'); batch = r.body;
});

test('results cannot be entered while the session is not running', async () => {
  await prisma.examinationSession.update({ where: { id: session.id }, data: { status: 'REGISTRATION_OPEN' } });
  assert.equal((await enter(A.enterer, csv(['R1,70', 'R2,55', 'R3,88']))).status, 400);
  await prisma.examinationSession.update({ where: { id: session.id }, data: { status: 'EXAM_ONGOING' } });
});

test('separation of duties: the person who entered cannot check, approve or release', async () => {
  assert.equal((await post(A.enterer, `/api/result-batches/${batch.id}/check`)).status, 403);
  assert.equal((await post(A.approver, `/api/result-batches/${batch.id}/approve`)).status, 409, 'cannot approve before checking');
});

test('nothing reaches the school before release', async () => {
  assert.equal((await A.school1.get('/api/school-portal/results')).body.items.length, 0);
  assert.equal((await A.school1.get(`/api/school-portal/results/${batch.id}`)).status, 404);
  assert.equal((await A.school1.get(`/api/result-batches/${batch.id}`)).status, 403);
});

test('a different officer checks; the checker cannot then approve; the approver can', async () => {
  assert.equal((await post(A.reg, `/api/result-batches/${batch.id}/check`)).status, 403, 'no results permission');
  assert.equal((await post(A.other, `/api/result-batches/${batch.id}/check`)).status, 200);
  assert.equal((await post(A.other, `/api/result-batches/${batch.id}/approve`)).status, 403, 'results officer has no approve permission');
  assert.equal((await post(A.enterer, `/api/result-batches/${batch.id}/approve`)).status, 403);
  assert.equal((await post(A.approver, `/api/result-batches/${batch.id}/release`)).status, 409, 'approve first');
  assert.equal((await post(A.approver, `/api/result-batches/${batch.id}/approve`)).status, 200);
});

test('a person who checked cannot also approve (even with both permissions)', async () => {
  const role = await prisma.role.findFirstOrThrow({ where: { key: 'results_approver' } });
  const user = await prisma.user.findFirstOrThrow({ where: { email: 'approver@aceiteka.test' } });
  const b = await prisma.resultBatch.create({ data: { sessionId: session.id, subjectCode: 'ENG', enteredById: (await prisma.user.findFirstOrThrow({ where: { email: 'results@aceiteka.test' } })).id, status: 'SUBMITTED_FOR_CHECK' } });
  assert.equal((await post(A.approver, `/api/result-batches/${b.id}/check`)).status, 200); // approver role includes results.review
  assert.equal((await post(A.approver, `/api/result-batches/${b.id}/approve`)).status, 403);
  assert.ok(role && user);
  await prisma.resultBatch.delete({ where: { id: b.id } });
});

test('release sends results to each school, and each school sees only its own students', async () => {
  const r = await post(A.approver, `/api/result-batches/${batch.id}/release`);
  assert.equal(r.status, 200); assert.equal(r.body.schools, 2);
  const one = await A.school1.get(`/api/school-portal/results/${batch.id}`);
  assert.equal(one.status, 200);
  assert.deepEqual(one.body.results.map((x) => x.registrationNumber), ['R1', 'R2']);
  const two = await A.school2.get(`/api/school-portal/results/${batch.id}`);
  assert.deepEqual(two.body.results.map((x) => x.registrationNumber), ['R3']);
  assert.equal(JSON.stringify(one.body).includes('R3'), false);
});

test('first view and downloads are counted; downloads are logged', async () => {
  const d = await A.school1.get(`/api/school-portal/results/${batch.id}/download`);
  assert.equal(d.status, 200); assert.match(d.text, /R1,Student R1,70/); assert.equal(d.text.includes('R3'), false);
  await A.school1.get(`/api/school-portal/results/${batch.id}/download`);
  const dist = await prisma.resultDistributionSchool.findFirstOrThrow({ where: { batchId: batch.id, schoolId: sch1.id } });
  assert.equal(dist.downloadCount, 2); assert.ok(dist.firstViewedAt);
  assert.ok(await prisma.activityLog.count({ where: { action: 'results.downloaded' } }) >= 2);
});

test('a school with no students in the batch cannot open it', async () => {
  const b = await prisma.resultBatch.findFirstOrThrow({ where: { id: batch.id } });
  await prisma.resultDistributionSchool.deleteMany({ where: { batchId: b.id, schoolId: sch2.id } });
  assert.equal((await A.school2.get(`/api/school-portal/results/${b.id}`)).status, 404);
  await prisma.resultDistributionSchool.create({ data: { batchId: b.id, schoolId: sch2.id } });
});

test('released results cannot be replaced; a correction is requested and approved by two different people', async () => {
  assert.equal((await enter(A.enterer, csv(['R1,99', 'R2,55', 'R3,88']))).status, 409);
  const res = await prisma.result.findFirstOrThrow({ where: { batchId: batch.id, candidate: { registrationNumber: 'R2' } } });
  assert.equal((await post(A.enterer, '/api/result-corrections', { resultId: res.id, newMark: 150, reason: 'typo in sheet' })).status, 400);
  const c = await post(A.enterer, '/api/result-corrections', { resultId: res.id, newMark: 65, reason: 'Marking sheet had a typo' });
  assert.equal(c.status, 201);
  assert.equal((await prisma.result.findUniqueOrThrow({ where: { id: res.id } })).mark, 55, 'mark unchanged until approved');
  assert.equal((await post(A.other, `/api/result-corrections/${c.body.id}/approve`)).status, 403);
  assert.equal((await post(A.approver, `/api/result-corrections/${c.body.id}/approve`)).status, 200);
  assert.equal((await prisma.result.findUniqueOrThrow({ where: { id: res.id } })).mark, 65);
  assert.equal((await post(A.approver, `/api/result-corrections/${c.body.id}/approve`)).status, 409);
});

test('returned results can be re-uploaded and the chain restarts', async () => {
  const r = await enter(A.enterer, csv(['R4,40']), 'CHEM');
  assert.equal(r.status, 201);
  assert.equal((await post(A.other, `/api/result-batches/${r.body.id}/return`, {})).status, 400, 'note needed');
  assert.equal((await post(A.other, `/api/result-batches/${r.body.id}/return`, { note: 'Please recheck R4.' })).body.status, 'CHANGES_REQUIRED');
  const again = await enter(A.enterer, csv(['R4,45']), 'CHEM');
  assert.equal(again.status, 201); assert.equal(again.body.id, r.body.id);
  assert.equal((await prisma.result.findFirstOrThrow({ where: { batchId: r.body.id } })).mark, 45);
});
