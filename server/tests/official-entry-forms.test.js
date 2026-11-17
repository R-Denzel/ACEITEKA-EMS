import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import ExcelJS from 'exceljs';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import 'dotenv/config';

process.env.NODE_ENV = 'test';
const testUploadDir = path.join(os.tmpdir(), `aceiteka-official-entry-test-${process.pid}`);
process.env.UPLOAD_DIR = testUploadDir;
const testDatabaseUrl = new URL(process.env.TEST_DATABASE_URL || process.env.DATABASE_URL);
testDatabaseUrl.pathname = '/ebmis_test';
process.env.DATABASE_URL = testDatabaseUrl.toString();
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.CLIENT_URL = 'http://localhost:5173';

let request, prisma, session, agents, createdSchoolId;
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
    registration: 'registration@aceiteka.test',
    printer: 'printer@aceiteka.test',
    school: 'school1@aceiteka.test',
  })) {
    agents[name] = request.agent(globalThis.__app);
    await post(agents[name], '/api/auth/login', { email, password: seed.DEMO_PASSWORD });
  }
  session = await prisma.examinationSession.create({
    data: { name: `Official Entry Workflow Test ${Date.now()}`, year: 2024, status: 'COMPLETED' },
  });
});

after(async () => {
  if (prisma && session) await prisma.examinationSession.delete({ where: { id: session.id } });
  if (prisma && createdSchoolId) await prisma.school.delete({ where: { id: createdSchoolId } });
  if (prisma) await prisma.$disconnect();
  await fs.rm(testUploadDir, { recursive: true, force: true });
});

test('UACE workbook is parsed for review, then approved totals reach printer planning', async () => {
  const workbook = new ExcelJS.Workbook();
  const arts = workbook.addWorksheet('ARTS');
  arts.getCell('C1').value = 'ACEITEKA UACE ARTS GENERAL ENTRY FORMS 2024';
  arts.getCell('B3').value = 'SCHOOL NAME';
  arts.getCell('C2').value = 'GENERAL PAPER (S101)';
  arts.getCell('D2').value = 'HISTORY (P210)';
  arts.getCell('C3').value = 1;
  arts.getCell('D3').value = 2;
  const school = await prisma.school.findUniqueOrThrow({ where: { code: 'SCH001' } });
  arts.getCell('B5').value = school.name;
  arts.getCell('C5').value = 12;
  arts.getCell('D5').value = 8;
  arts.getCell('B6').value = 'TOTAL ENTRIES';
  arts.getCell('C6').value = 999;
  arts.getCell('D6').value = 999;

  const sciences = workbook.addWorksheet('SCIENCES');
  sciences.getCell('C1').value = 'ACEITEKA UACE SCIENCE GENERAL ENTRY FORM 2024';
  sciences.getCell('B3').value = 'SCHOOL NAME';
  sciences.getCell('C2').value = 'MATHEMATICS (P425)';
  sciences.getCell('D2').value = 'MATHEMATICS (P425)';
  sciences.getCell('C3').value = 1;
  sciences.getCell('D3').value = 2;
  sciences.getCell('B5').value = school.name;
  sciences.getCell('C5').value = 10;
  sciences.getCell('D5').value = 10;

  const backup = workbook.addWorksheet('ARTS backup');
  backup.getCell('B3').value = 'SCHOOL NAME';
  backup.getCell('C2').value = 'DUPLICATE (X999)';
  backup.getCell('C3').value = 1;
  backup.getCell('B5').value = 'Ignored backup school';
  backup.getCell('C5').value = 99;

  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());
  const uploaded = await agents.examadmin.post('/api/official-entry-imports')
    .set('Origin', process.env.CLIENT_URL)
    .field('sessionId', session.id)
    .attach('file', buffer, { filename: 'official-uace-entries-2024.xlsx', contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  assert.equal(uploaded.status, 201, uploaded.body.error);
  assert.equal(uploaded.body.formType, 'UACE_GENERAL');
  assert.equal(uploaded.body.formYear, 2024);
  assert.equal(uploaded.body.recordCount, 1);
  assert.equal(uploaded.body.status, 'SUBMITTED');

  const details = await agents.examadmin.get(`/api/official-entry-imports/${uploaded.body.id}`);
  const [record] = details.body.records;
  assert.equal(record.schoolName, school.name);
  assert.equal(record.schoolId, school.id);
  assert.deepEqual(record.extractedData.subjects.map((subject) => subject.code), ['P425', 'P210', 'S101'].sort());
  assert.equal(record.extractedData.subjects.find((subject) => subject.code === 'P425').papers.length, 2);
  assert.equal(record.extractedData.subjects.find((subject) => subject.code === 'P425').papers[0].count, 10);
  assert.equal((await agents.examadmin.get(`/api/official-entry-imports/${uploaded.body.id}/file`)).status, 403);
  assert.equal((await agents.registration.get(`/api/official-entry-imports/${uploaded.body.id}/file`)).status, 200);
  const photoUpload = await agents.examadmin.post('/api/official-entry-imports')
    .set('Origin', process.env.CLIENT_URL)
    .field('sessionId', session.id)
    .attach('file', Buffer.from([0xff, 0xd8, 0xff, 0xd9]), { filename: 'entry.jpg', contentType: 'image/jpeg' });
  assert.equal(photoUpload.status, 403);
  assert.equal((await agents.examadmin.patch(`/api/official-entry-imports/${uploaded.body.id}/review`).set('Origin', process.env.CLIENT_URL).send({ status: 'APPROVED' })).status, 403);
  assert.equal((await agents.school.get('/api/school-portal/official-entry-imports')).body.items.length, 0);

  const unmatchedRecord = await prisma.officialEntryRecord.create({
    data: {
      importId: uploaded.body.id,
      schoolName: 'Previously Unregistered Sample School',
      extractedData: record.extractedData,
      reviewedData: { ...record.extractedData, schoolName: 'Previously Unregistered Sample School' },
    },
  });
  const schoolCreateUrl = `/api/official-entry-imports/${uploaded.body.id}/records/${unmatchedRecord.id}/school`;
  assert.equal((await agents.examadmin.post(schoolCreateUrl).set('Origin', process.env.CLIENT_URL).send({ code: 'NEWSCH001' })).status, 403);
  const addedSchool = await agents.registration.post(schoolCreateUrl).set('Origin', process.env.CLIENT_URL).send({ code: 'NEWSCH001' });
  assert.equal(addedSchool.status, 201, addedSchool.body.error);
  assert.equal(addedSchool.body.school.name, 'Previously Unregistered Sample School');
  createdSchoolId = addedSchool.body.school.id;
  assert.equal((await prisma.officialEntryRecord.findUnique({ where: { id: unmatchedRecord.id } })).schoolId, addedSchool.body.school.id);

  const reviewedData = {
    ...record.extractedData,
    subjects: record.extractedData.subjects.map((subject) => ({
      ...subject,
      papers: subject.papers.map((paper) => ({ ...paper, count: paper.count })),
    })),
  };
  const saved = await agents.registration.patch(`/api/official-entry-imports/${uploaded.body.id}/records/${record.id}`)
    .set('Origin', process.env.CLIENT_URL).send(reviewedData);
  assert.equal(saved.status, 200, saved.body.error);

  const approved = await agents.registration.patch(`/api/official-entry-imports/${uploaded.body.id}/review`)
    .set('Origin', process.env.CLIENT_URL).send({ status: 'APPROVED' });
  assert.equal(approved.status, 200, approved.body.error);
  assert.equal(approved.body.status, 'APPROVED');

  const print = await agents.printer.get(`/api/printer/dashboard?sessionId=${session.id}`);
  assert.equal(print.status, 200);
  assert.deepEqual(print.body.officialPaperCounts.map((paper) => [paper.subjectCode, paper.paperNumber, paper.count]), [
    ['P210', 2, 16],
    ['P425', 1, 20],
    ['P425', 2, 20],
    ['S101', 1, 24],
  ]);
});
