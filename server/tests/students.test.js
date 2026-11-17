import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://ebmis:ebmis_dev@localhost:5433/ebmis_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';

let request, prisma, session, app;
const A = {};
const O = () => process.env.CLIENT_URL;

const csv = (rows) => Buffer.from(['registration_number,full_name,date_of_birth,gender,subjects', ...rows].join('\n'));
const up = (agent, buf, name = 'students.csv', sessionId = session.id) =>
  agent.post('/api/school-portal/submissions').set('Origin', O()).field('sessionId', sessionId).attach('file', buf, name);
const post = (agent, url, body = {}) => agent.post(url).set('Origin', O()).send(body);

async function login(email, pw = 'Demo-Pass-2026') {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', O()).send({ email, password: pw });
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
  await prisma.examinationSession.update({ where: { id: session.id }, data: { status: 'REGISTRATION_OPEN' } });
  await prisma.resultCorrection.deleteMany({}); await prisma.resultDistributionSchool.deleteMany({}); await prisma.result.deleteMany({}); await prisma.resultBatch.deleteMany({});
  await prisma.candidate.deleteMany({ where: { sessionId: session.id } });
  await prisma.candidateSubmission.deleteMany({ where: { sessionId: session.id } });
  for (const [k, e] of Object.entries({ school1: 'school1@aceiteka.test', school2: 'school2@aceiteka.test', reg: 'registration@aceiteka.test', results: 'results@aceiteka.test', examadmin: 'examadmin@aceiteka.test' })) A[k] = await login(e);
});
after(async () => { await prisma.$disconnect(); });

test('school can download the student template', async () => {
  const r = await A.school1.get(`/api/school-portal/student-template?sessionId=${session.id}`);
  assert.equal(r.status, 200);
  assert.match(r.text, /^registration_number,full_name,date_of_birth,gender,subjects/);
});

test('invalid rows are reported with plain-English reasons and the school is asked to fix them', async () => {
  const r = await up(A.school1, csv([
    'STM001,Alice One,2009-01-15,F,MATH;ENG;PHY',        // good
    'STM001,Bob Two,2009-02-30,M,MATH;ENG;PHY',          // duplicate number + impossible date
    'STM003,,2009-05-05,M,MATH;ENG;PHY',                 // missing name
    'STM004,Dan Four,2009-05-05,X,MATH;ENG;ZZZ',         // bad gender, unknown subject
    'STM005,Eve Five,2009-05-05,F,PHY;HIST;ENG',         // not an approved combination
  ]));
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'CHANGES_REQUIRED');
  assert.equal(r.body.validRecords, 1);
  assert.equal(r.body.invalidRecords, 4);
  const d = await A.school1.get(`/api/school-portal/submissions/${r.body.id}`);
  const msgs = JSON.stringify(d.body.errorRows);
  assert.match(msgs, /also used on row 2/);
  assert.match(msgs, /not valid/);
  assert.match(msgs, /Full name is missing/);
  assert.match(msgs, /Gender must be M or F/);
  assert.match(msgs, /not offered in this examination session: ZZZ/);
  assert.match(msgs, /not approved/);
});

test('structural file problems are refused: wrong columns, binary file, too large, empty', async () => {
  assert.equal((await up(A.school1, Buffer.from('a,b,c\n1,2,3'))).status, 400);
  const bin = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]), Buffer.alloc(500)]);
  const r = await up(A.school1, bin, 'students.csv');
  assert.equal(r.status, 400); assert.match(r.body.error, /not allowed/);
  assert.equal((await up(A.school1, Buffer.alloc(6 * 1024 * 1024, 'a'))).status, 400);
  assert.equal((await up(A.school1, Buffer.from(''))).status, 400);
});

test('registration must be open', async () => {
  const closed = await prisma.examinationSession.create({ data: { name: 'Closed ' + Date.now(), year: 2026, status: 'REGISTRATION_CLOSED' } });
  const r = await up(A.school1, csv(['X001,Test,2009-01-01,F,MATH;ENG;PHY']), 'a.csv', closed.id);
  assert.equal(r.status, 400); assert.match(r.body.error, /not open/);
});

test('a corrected file is accepted, and an Excel file works too', async () => {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Students');
  ws.addRow(['registration_number', 'full_name', 'date_of_birth', 'gender', 'subjects']);
  ws.addRow(['STM001', 'Alice One', '2009-01-15', 'F', 'MATH;ENG;PHY']);
  ws.addRow(['STM002', 'Bob Two', '2009-02-20', 'M', 'MATH;ENG;HIST']);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const r = await up(A.school1, buf, 'students.xlsx');
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.status, 'SUBMITTED');
  assert.equal(r.body.validRecords, 2);
  globalThis.__sub = r.body.id;
});

test('school 2 cannot see or fetch school 1 submissions', async () => {
  const list = await A.school2.get('/api/school-portal/submissions');
  assert.equal(list.body.items.length, 0);
  assert.equal((await A.school2.get(`/api/school-portal/submissions/${globalThis.__sub}`)).status, 404);
});

test('permissions: school and results officer cannot review or approve', async () => {
  assert.equal((await post(A.school1, `/api/submissions/${globalThis.__sub}/approve`)).status, 403);
  assert.equal((await post(A.results, `/api/submissions/${globalThis.__sub}/approve`)).status, 403);
  assert.equal((await A.school1.get('/api/candidates')).status, 403);
});

test('officer must explain a return; returning sends it back to the school', async () => {
  const bad = await post(A.reg, `/api/submissions/${globalThis.__sub}/return`, {});
  assert.equal(bad.status, 400);
  assert.equal((await post(A.reg, `/api/submissions/${globalThis.__sub}/start-review`)).status, 200);
  const back = await post(A.reg, `/api/submissions/${globalThis.__sub}/return`, { note: 'Please check Alice date of birth.' });
  assert.equal(back.body.status, 'CHANGES_REQUIRED');
  const seen = await A.school1.get(`/api/school-portal/submissions/${globalThis.__sub}`);
  assert.match(seen.body.reviewNote, /date of birth/);
});

test('approval creates official records, locks the school out of changes, and blocks duplicate numbers elsewhere', async () => {
  const r = await up(A.school1, csv(['STM001,Alice One,2009-01-15,F,MATH;ENG;PHY', 'STM002,Bob Two,2009-02-20,M,MATH;ENG;HIST']));
  assert.equal(r.body.status, 'SUBMITTED');
  const ok = await post(A.reg, `/api/submissions/${r.body.id}/approve`);
  assert.equal(ok.status, 200); assert.equal(ok.body.students, 2);
  assert.equal(await prisma.candidate.count({ where: { sessionId: session.id } }), 2);
  const again = await up(A.school1, csv(['STM009,New Kid,2009-01-15,F,MATH;ENG;PHY']));
  assert.equal(again.status, 409);
  const other = await up(A.school2, csv(['stm001,Copy Cat,2009-01-15,F,MATH;ENG;PHY']));
  assert.equal(other.body.invalidRecords, 1);
  assert.match(JSON.stringify(await (await A.school2.get(`/api/school-portal/submissions/${other.body.id}`)).body.errorRows), /already used/);
  assert.ok(await prisma.activityLog.findFirst({ where: { action: 'students.approved', entityId: r.body.id } }));
});

test('official register is searchable and exportable by staff', async () => {
  const q = await A.reg.get('/api/candidates?q=alice');
  assert.equal(q.body.total, 1);
  const x = await A.reg.get(`/api/candidates/export?sessionId=${session.id}`);
  assert.match(x.text, /STM002/);
});

test('subjects, groups and sessions: only the right staff can change them', async () => {
  assert.equal((await post(A.reg, '/api/subjects', { code: 'GEO', name: 'Geography' })).status, 403);
  const code = 'G' + Date.now().toString().slice(-5);
  const created = await post(A.examadmin, '/api/subjects', {
    code, name: 'Test Subject', papers: [{ number: 1, code: `${code}1` }, { number: 3, code: `${code}3` }],
  });
  assert.equal(created.status, 201);
  assert.deepEqual(created.body.papers.map((paper) => [paper.number, paper.code]), [[1, `${code}1`], [3, `${code}3`]]);
  assert.equal((await post(A.examadmin, '/api/subjects', { code, name: 'Test Subject' })).status, 409);
  assert.equal((await post(A.examadmin, '/api/subjects', { code: `${code}2`, name: 'Invalid papers', papers: [{ number: 1, code: 'PAPER-X' }, { number: 1, code: 'PAPER-Y' }] })).status, 400);
  const listed = (await A.examadmin.get('/api/subjects')).body.items.find((subject) => subject.id === created.body.id);
  assert.equal(listed.papers.length, 2);
  assert.equal((await post(A.examadmin, '/api/sessions', { name: 'Bad', year: 2026, registrationOpens: '2026-05-01', registrationCloses: '2026-04-01' })).status, 400);
  assert.equal((await A.school1.get('/api/subjects')).status, 403);
});

test('a subject group can be edited, and the new rules apply to later checks', async () => {
  const groups = (await A.examadmin.get('/api/subject-groups')).body.items;
  const g = groups.find((x) => x.name === 'Arts');
  const ids = g.subjects.map((s) => s.subjectId);
  const put = (body) => A.examadmin.put(`/api/subject-groups/${g.id}`).set('Origin', O()).send(body);
  assert.equal((await put({ name: 'Arts', minSubjects: 4, maxSubjects: 3, subjectIds: ids })).status, 400);
  assert.equal((await put({ name: 'Arts', minSubjects: 2, maxSubjects: 3, subjectIds: [] })).status, 400);
  assert.equal((await A.reg.put(`/api/subject-groups/${g.id}`).set('Origin', O()).send({ name: 'Arts', minSubjects: 2, maxSubjects: 3, subjectIds: ids })).status, 403);
  assert.equal((await put({ name: 'Arts', minSubjects: 2, maxSubjects: 3, subjectIds: ids })).status, 200);
  const after = (await A.examadmin.get('/api/subject-groups')).body.items.find((x) => x.id === g.id);
  assert.equal(after.minSubjects, 2);
  assert.equal(after.subjects.length, ids.length);
  assert.equal((await put({ name: 'Arts', minSubjects: 3, maxSubjects: 5, subjectIds: ids })).status, 200); // restore
});
