import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://ebmis:ebmis_dev@localhost:5433/ebmis_test';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';

let request, prisma, DEMO_PASSWORD;
const agents = {};

async function login(email, password) {
  const agent = request.agent(globalThis.__app);
  const res = await agent.post('/api/auth/login').set('Origin', process.env.CLIENT_URL).send({ email, password });
  return { agent, res };
}
const post = (agent, url, body) => agent.post(url).set('Origin', process.env.CLIENT_URL).send(body);

before(async () => {
  execSync('npx prisma migrate deploy', { stdio: 'ignore', env: process.env });
  const supertest = (await import('supertest')).default;
  request = supertest;
  ({ prisma } = await import('../src/db.js'));
  const seed = await import('../prisma/seed.js');
  DEMO_PASSWORD = seed.DEMO_PASSWORD;
  await seed.seedAccessControl();
  await seed.seedDemo();
  const { createApp } = await import('../src/app.js');
  globalThis.__app = createApp();
  for (const [name, email] of Object.entries({ sysadmin: 'sysadmin@aceiteka.test', examadmin: 'examadmin@aceiteka.test', results: 'results@aceiteka.test', school1: 'school1@aceiteka.test', school2: 'school2@aceiteka.test' })) {
    agents[name] = (await login(email, DEMO_PASSWORD)).agent;
  }
});
after(async () => { await prisma.$disconnect(); });

test('valid login returns the user and sets an HttpOnly cookie', async () => {
  const { res } = await login('examadmin@aceiteka.test', DEMO_PASSWORD);
  assert.equal(res.status, 200);
  assert.equal(res.body.user.email, 'examadmin@aceiteka.test');
  assert.match(res.headers['set-cookie'][0], /HttpOnly/);
  assert.equal(res.body.user.passwordHash, undefined);
});

test('invalid login is rejected with a plain message', async () => {
  const { res } = await login('examadmin@aceiteka.test', 'wrong-password');
  assert.equal(res.status, 401);
  assert.match(res.body.error, /not correct/);
});

test('API without a session is rejected', async () => {
  const res = await request(globalThis.__app).get('/api/schools');
  assert.equal(res.status, 401);
});

test('logout ends the session', async () => {
  const { agent } = await login('registration@aceiteka.test', DEMO_PASSWORD);
  assert.equal((await agent.get('/api/auth/me')).status, 200);
  assert.equal((await post(agent, '/api/auth/logout', {})).status, 200);
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('staff without the permission are blocked (results officer cannot create schools or see users)', async () => {
  assert.equal((await post(agents.results, '/api/schools', { code: 'X1', name: 'X School' })).status, 403);
  assert.equal((await agents.results.get('/api/users')).status, 403);
});

test('exam admin can create a school; duplicate codes are refused; action is logged', async () => {
  const code = 'T' + Date.now().toString().slice(-6);
  const ok = await post(agents.examadmin, '/api/schools', { code, name: 'Test School' });
  assert.equal(ok.status, 201);
  assert.equal((await post(agents.examadmin, '/api/schools', { code, name: 'Test School' })).status, 409);
  const log = await prisma.activityLog.findFirst({ where: { action: 'school.created', entityId: ok.body.id } });
  assert.ok(log);
});

test('validation errors name the field in plain English', async () => {
  const res = await post(agents.examadmin, '/api/schools', { code: 'A', name: '' });
  assert.equal(res.status, 400);
  assert.ok(res.body.fields.code);
});

test('school users cannot reach staff routes', async () => {
  for (const url of ['/api/schools', '/api/users', '/api/activity-history', '/api/dashboard']) {
    assert.equal((await agents.school1.get(url)).status, 403, url);
  }
});

test('school portal returns only the signed-in school, ignoring any ID sent by the browser', async () => {
  const mine = await agents.school1.get("/api/school-portal/profile");
  const other = await agents.school2.get('/api/school-portal/profile');
  assert.equal(mine.body.code, 'SCH001');
  assert.equal(other.body.code, 'SCH002');
  const otherSchool = await prisma.school.findUnique({ where: { code: 'SCH002' } });
  const tampered = await agents.school1.get(`/api/school-portal/profile?schoolId=${otherSchool.id}`).set('X-School-Id', otherSchool.id);
  assert.equal(tampered.body.code, 'SCH001');
});

test('staff cannot use the school portal', async () => {
  assert.equal((await agents.examadmin.get('/api/school-portal/profile')).status, 403);
});

test('a deactivated account is locked out immediately', async () => {
  const u = await prisma.user.create({ data: { email: `tmp${Date.now()}@aceiteka.test`, fullName: 'Tmp', passwordHash: (await prisma.user.findUnique({ where: { email: 'results@aceiteka.test' } })).passwordHash } });
  const { agent, res } = await login(u.email, DEMO_PASSWORD);
  assert.equal(res.status, 200);
  await prisma.user.update({ where: { id: u.id }, data: { isActive: false } });
  assert.equal((await agent.get('/api/auth/me')).status, 401);
});

test('cross-site state changes are blocked', async () => {
  const res = await request(globalThis.__app).post('/api/auth/login').set('Origin', 'http://evil.example').send({ email: 'a@b.co', password: 'x' });
  assert.equal(res.status, 403);
});

test('password reset flow works once and the token cannot be reused', async () => {
  const crypto = await import('node:crypto');
  const user = await prisma.user.findUnique({ where: { email: 'school2@aceiteka.test' } });
  const token = 'tok' + crypto.randomBytes(20).toString('hex');
  await prisma.passwordReset.create({ data: { userId: user.id, tokenHash: crypto.createHash('sha256').update(token).digest('hex'), expiresAt: new Date(Date.now() + 3600000) } });
  const r1 = await post(request(globalThis.__app), '/api/auth/reset-password', { token, newPassword: 'Another-Pass-77' });
  assert.equal(r1.status, 200);
  const r2 = await post(request(globalThis.__app), '/api/auth/reset-password', { token, newPassword: 'Another-Pass-78' });
  assert.equal(r2.status, 400);
  const { res } = await login('school2@aceiteka.test', 'Another-Pass-77');
  assert.equal(res.status, 200);
  const seed = await import('../prisma/seed.js');
  await seed.seedDemo(); // restore demo password
});
