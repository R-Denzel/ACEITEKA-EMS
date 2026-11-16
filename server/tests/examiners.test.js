import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://ebmis:ebmis_dev@localhost:5433/ebmis_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ebmis-docs-'));
process.env.UPLOAD_DIR = tmp;

let request, prisma, session, app;
const A = {};
const O = () => process.env.CLIENT_URL;
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n');
const post = (agent, url, body = {}) => agent.post(url).set('Origin', O()).send(body);

async function login(email) {
  const agent = request.agent(app);
  const r = await agent.post('/api/auth/login').set('Origin', O()).send({ email, password: 'Demo-Pass-2026' });
  assert.equal(r.status, 200, email);
  return agent;
}
const nominate = (agent, fields = {}, files = [['cert.pdf', PDF]]) => {
  const f = { sessionId: session.id, fullName: 'Grace Examiner', email: 'grace@example.test', nationalId: 'NID-1001', subjectCode: 'MATH', qualifications: 'BSc Mathematics, 8 years teaching', ...fields };
  let r = agent.post('/api/school-portal/nominations').set('Origin', O());
  for (const [k, v] of Object.entries(f)) if (v !== undefined) r = r.field(k, v);
  for (const [name, buf] of files) r = r.attach('documents', buf, name);
  return r;
};

before(async () => {
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
  request = (await import('supertest')).default;
  ({ prisma } = await import('../src/db.js'));
  const seed = await import('../prisma/seed.js');
  await seed.seedAccessControl(); await seed.seedDemo();
  app = (await import('../src/app.js')).createApp();
  session = await prisma.examinationSession.findFirstOrThrow({ where: { name: 'End of Year Examinations', year: 2026 } });
  await prisma.examinerAppointment.deleteMany({});
  await prisma.uploadedFile.deleteMany({});
  await prisma.examinerNomination.deleteMany({});
  await prisma.examinerProfile.deleteMany({});
  for (const [k, e] of Object.entries({ school1: 'school1@aceiteka.test', school2: 'school2@aceiteka.test', officer: 'examiners@aceiteka.test', examadmin: 'examadmin@aceiteka.test', results: 'results@aceiteka.test' })) A[k] = await login(e);
});
after(async () => { await prisma.$disconnect(); fs.rmSync(tmp, { recursive: true, force: true }); });

let nom;
test('a school can recommend an examiner with a supporting document', async () => {
  const r = await nominate(A.school1);
  assert.equal(r.status, 201);
  assert.equal(r.body.status, 'SUBMITTED');
  assert.equal(r.body.documents.length, 1);
  nom = r.body;
  assert.equal(fs.readdirSync(path.join(tmp, 'examiner-documents')).length, 1);
});

test('invalid recommendations are refused with clear messages', async () => {
  const noId = await nominate(A.school1, { email: undefined, nationalId: undefined });
  assert.equal(noId.status, 400);
  assert.match(JSON.stringify(noId.body), /national ID or an email/);
  assert.equal((await nominate(A.school1, { subjectCode: 'ZZZ' })).status, 400);
  assert.equal((await nominate(A.school1, { fullName: '' })).status, 400);
});

test('only PDF, PNG or JPG content is accepted, whatever the file name says', async () => {
  const r = await nominate(A.school1, { nationalId: 'NID-BAD' }, [['cert.pdf', Buffer.from('MZ this is an executable')]]);
  assert.equal(r.status, 400);
  assert.match(r.body.error, /not a PDF, PNG or JPG/);
  assert.equal(await prisma.examinerNomination.count({ where: { nationalId: 'NID-BAD' } }), 0);
});

test('documents are private: owner school and staff only', async () => {
  const docId = nom.documents[0].id;
  assert.equal((await A.school1.get(`/api/school-portal/nominations/${nom.id}/documents/${docId}`)).status, 200);
  assert.equal((await A.school2.get(`/api/school-portal/nominations/${nom.id}/documents/${docId}`)).status, 404);
  assert.equal((await A.officer.get(`/api/nominations/${nom.id}/documents/${docId}`)).status, 200);
  assert.equal((await A.results.get(`/api/nominations/${nom.id}/documents/${docId}`)).status, 403);
  assert.equal((await request(app).get(`/api/nominations/${nom.id}/documents/${docId}`)).status, 401);
});

test('schools only see their own recommendations; staff routes are closed to schools', async () => {
  assert.equal((await A.school1.get('/api/school-portal/nominations')).body.items.length, 1);
  assert.equal((await A.school2.get('/api/school-portal/nominations')).body.items.length, 0);
  assert.equal((await A.school1.get('/api/nominations')).status, 403);
});

test('review: return needs a note, school can send a new recommendation', async () => {
  assert.equal((await post(A.officer, `/api/nominations/${nom.id}/return`, {})).status, 400);
  const r = await post(A.officer, `/api/nominations/${nom.id}/return`, { note: 'Please attach the teaching certificate.' });
  assert.equal(r.body.status, 'CHANGES_REQUIRED');
  const mine = await A.school1.get('/api/school-portal/nominations');
  assert.match(mine.body.items[0].reviewNote, /teaching certificate/);
  assert.equal((await post(A.officer, `/api/nominations/${nom.id}/approve`)).status, 409);
});

test('a reviewer without approve permission cannot approve or reject', async () => {
  const fresh = (await nominate(A.school1, { fullName: 'Henry Second', email: 'henry@example.test', nationalId: 'NID-2002', subjectCode: 'ENG' })).body;
  assert.equal((await post(A.examadmin, `/api/nominations/${fresh.id}/approve`)).status, 403);
  assert.equal((await post(A.examadmin, `/api/nominations/${fresh.id}/reject`, { note: 'no' })).status, 403);
  assert.equal((await post(A.examadmin, `/api/nominations/${fresh.id}/start-review`)).status, 200);
});

test('approving a recommendation creates a verified profile but does NOT assign the examiner', async () => {
  const sub = (await nominate(A.school1, { fullName: 'Ivy Third', email: 'ivy@example.test', nationalId: 'NID-3003' })).body;
  const r = await post(A.officer, `/api/nominations/${sub.id}/approve`);
  assert.equal(r.status, 200);
  const profile = await prisma.examinerProfile.findUniqueOrThrow({ where: { id: r.body.profileId } });
  assert.equal(profile.nationalId, 'NID-3003');
  assert.equal((await prisma.examinerNomination.findUniqueOrThrow({ where: { id: sub.id } })).status, 'APPROVED');
  assert.equal(await prisma.examinerAppointment.count(), 0, 'approval must never create an appointment');
});

test('the same person recommended again reuses one profile (no duplicates)', async () => {
  const again = (await nominate(A.school2, { fullName: 'Ivy T. Third', email: 'other@example.test', nationalId: 'nid-3003', subjectCode: 'PHY' })).body;
  const r = await post(A.officer, `/api/nominations/${again.id}/approve`);
  assert.equal(r.status, 200);
  assert.equal(await prisma.examinerProfile.count({ where: { nationalId: 'NID-3003' } }), 1);
  const p = await prisma.examinerProfile.findUniqueOrThrow({ where: { id: r.body.profileId } });
  assert.deepEqual([...p.subjectCodes].sort(), ['MATH', 'PHY']);
  // matched by email when no national ID is given
  const byMail = (await nominate(A.school1, { fullName: 'Ivy', email: 'ivy@example.test', nationalId: undefined, subjectCode: 'BIO' })).body;
  await post(A.officer, `/api/nominations/${byMail.id}/approve`);
  assert.equal(await prisma.examinerProfile.count({ where: { email: 'ivy@example.test' } }), 1);
});

test('assigning an examiner is a separate step with its own permission', async () => {
  const profile = await prisma.examinerProfile.findFirstOrThrow({ where: { nationalId: 'NID-3003' } });
  const body = { profileId: profile.id, sessionId: session.id, subjectCode: 'MATH' };
  assert.equal((await post(A.examadmin, '/api/examiner-appointments', body)).status, 403);
  assert.equal((await post(A.school1, '/api/examiner-appointments', body)).status, 403);
  const ok = await post(A.officer, '/api/examiner-appointments', body);
  assert.equal(ok.status, 201);
  assert.equal((await post(A.officer, '/api/examiner-appointments', body)).status, 409);
  assert.equal((await post(A.officer, '/api/examiner-appointments', { ...body, subjectCode: 'HIST' })).status, 400, 'not approved for HIST');
  assert.equal((await A.officer.delete(`/api/examiner-appointments/${ok.body.id}`).set('Origin', O())).status, 200);
});

test('nomination actions appear in activity history', async () => {
  const n = await prisma.activityLog.count({ where: { action: { in: ['examiners.nominated', 'examiners.approved', 'examiners.assigned', 'examiners.document_viewed'] } } });
  assert.ok(n >= 4);
});
