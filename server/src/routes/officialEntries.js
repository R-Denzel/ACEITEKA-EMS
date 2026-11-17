import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../db.js';
import { HttpError, requirePermission } from '../middleware.js';
import { logActivity } from '../audit.js';
import { extractUaceWorkbook, recognizeOfficialEntryPhoto, sniffOfficialEntryFile, validateReviewedEntry } from '../officialEntryForms.js';

const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'official-entry-forms');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } });
const uploadFile = (req, res, next) => upload.single('file')(req, res, (err) => {
  if (!err) return next();
  next(err.code === 'LIMIT_FILE_SIZE' ? new HttpError(400, 'The official entry form is too large. The limit is 10 MB.')
    : new HttpError(400, 'The official entry form could not be uploaded.'));
});
const recordInclude = { orderBy: { schoolName: 'asc' } };
const importInclude = { session: true, records: recordInclude };
const normalized = (value) => String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const requireEntryReview = (req, _res, next) => {
  if (req.user?.permissions.has('students.review') || req.user?.permissions.has('students.approve')) return next();
  next(new HttpError(403, 'You do not have permission to review official entry forms.'));
};

function publicImport(item) {
  return {
    id: item.id,
    sessionId: item.sessionId,
    session: item.session && { id: item.session.id, name: item.session.name, year: item.session.year },
    originalName: item.originalName,
    mimeType: item.mimeType,
    source: item.source,
    formType: item.formType,
    formYear: item.formYear,
    status: item.status,
    reviewNote: item.reviewNote,
    createdAt: item.createdAt,
    reviewedAt: item.reviewedAt,
    recordCount: item.records?.length ?? 0,
    records: item.records?.map((record) => ({
      id: record.id,
      schoolId: record.schoolId,
      schoolName: record.schoolName,
      extractedData: record.extractedData,
      reviewedData: record.reviewedData,
      warnings: record.warnings || [],
    })),
  };
}

async function getSession(sessionId) {
  const session = await prisma.examinationSession.findUnique({
    where: { id: sessionId },
    include: { subjects: { include: { subject: { include: { papers: { orderBy: { number: 'asc' } } } } } } },
  });
  if (!session) throw new HttpError(404, 'Examination session not found.');
  return session;
}

async function matchedSchoolId(schoolName, schoolMap) {
  return schoolMap.get(normalized(schoolName)) || null;
}

async function createImport(req, session, { schoolId = null, schoolName = '' } = {}) {
  if (!req.file) throw new HttpError(400, 'Choose an official entry form to upload.');
  const detectedType = sniffOfficialEntryFile(req.file.buffer);
  if (!detectedType) throw new HttpError(400, 'Upload a clear PNG/JPG photo or the official .xlsx workbook.');

  let parsed;
  let source;
  let mimeType;
  let extension;
  if (detectedType === 'xlsx') {
    if (schoolId) throw new HttpError(400, 'School accounts must upload a photo of their own official entry form.');
    parsed = await extractUaceWorkbook(req.file.buffer);
    source = 'UACE_WORKBOOK';
    mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    extension = 'xlsx';
  } else {
    if (!schoolId && !req.user.permissions.has('students.review') && !req.user.permissions.has('students.approve')) {
      throw new HttpError(403, 'Only entry reviewers can upload official form photos for cross-checking.');
    }
    const subjects = session.subjects.map(({ subject }) => ({ subject }));
    parsed = await recognizeOfficialEntryPhoto(req.file.buffer, subjects);
    source = 'PHOTO';
    mimeType = detectedType === 'png' ? 'image/png' : 'image/jpeg';
    extension = detectedType;
    if (parsed.year && parsed.year !== session.year) {
      throw new HttpError(400, `The photo appears to be for ${parsed.year}, but the selected examination session is ${session.year}. Choose a matching session or verify the form year.`);
    }
    if (schoolId) parsed.records[0].schoolName = schoolName;
    else {
      const submittedSchoolName = String(req.body.schoolName || '').trim();
      if (!submittedSchoolName) throw new HttpError(400, 'Enter the school name shown on this form.');
      parsed.records[0].schoolName = submittedSchoolName;
    }
    parsed.year ||= session.year;
  }

  if (session.year !== parsed.year) {
    throw new HttpError(400, `The form year (${parsed.year}) must match the selected examination session year (${session.year}).`);
  }
  if (!parsed.records.length || parsed.records.length > 500) throw new HttpError(400, 'The upload must contain between 1 and 500 school entry summaries.');

  const schools = await prisma.school.findMany({ select: { id: true, name: true } });
  const schoolMap = new Map(schools.map((school) => [normalized(school.name), school.id]));
  const storageKey = `${crypto.randomUUID()}.${extension}`;
  const directory = uploadDir();
  await fs.mkdir(directory, { recursive: true });
  const filePath = path.join(directory, storageKey);
  await fs.writeFile(filePath, req.file.buffer, { flag: 'wx' });

  try {
    const created = await prisma.officialEntryImport.create({
      data: {
        sessionId: session.id,
        uploadedById: req.user.id,
        originalName: path.basename(req.file.originalname).slice(0, 200),
        storageKey,
        mimeType,
        sizeBytes: req.file.size,
        source,
        formType: parsed.formType,
        formYear: parsed.year,
        records: {
          create: await Promise.all(parsed.records.map(async (record) => ({
            schoolId: schoolId || await matchedSchoolId(record.schoolName, schoolMap),
            schoolName: record.schoolName,
            extractedData: {
              schoolName: record.schoolName,
              centreName: record.centreName || '',
              centreNumber: record.centreNumber || '',
              totalCandidates: record.totalCandidates ?? null,
              district: record.district || '',
              zone: record.zone || '',
              subjects: record.subjects,
            },
            warnings: record.warnings || [],
          }))),
        },
      },
      include: importInclude,
    });
    await logActivity(req, 'official_entries.uploaded', {
      entity: 'OfficialEntryImport',
      entityId: created.id,
      after: { source, formType: parsed.formType, formYear: parsed.year, records: parsed.records.length },
    });
    return created;
  } catch (error) {
    await fs.unlink(filePath).catch((unlinkError) => {
      if (unlinkError.code !== 'ENOENT') throw unlinkError;
    });
    throw error;
  }
}

async function readOriginal(item, res) {
  let data;
  try {
    data = await fs.readFile(path.join(uploadDir(), item.storageKey));
  } catch (error) {
    if (error.code === 'ENOENT') throw new HttpError(404, 'The uploaded official form could not be found.');
    throw error;
  }
  res.setHeader('Content-Type', item.mimeType);
  res.setHeader('Content-Disposition', `${item.source === 'PHOTO' ? 'inline' : 'attachment'}; filename="${item.originalName.replace(/[^\w.\- ]/g, '_')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.send(data);
}

export function registerOfficialEntryPortal(portal) {
  portal.get('/official-entry-imports', requirePermission('students.upload'), async (req, res, next) => {
    try {
      const items = await prisma.officialEntryImport.findMany({
        where: { source: 'PHOTO', records: { some: { schoolId: req.user.schoolId } } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: importInclude,
      });
      res.json({ items: items.map(publicImport) });
    } catch (error) { next(error); }
  });

  portal.post('/official-entry-imports', requirePermission('students.upload'), uploadFile, async (req, res, next) => {
    try {
      const { sessionId } = z.object({ sessionId: z.string().min(1, 'Choose an examination session.') }).parse(req.body);
      const session = await getSession(sessionId);
      const school = await prisma.school.findUnique({ where: { id: req.user.schoolId }, select: { id: true, name: true } });
      if (!school) throw new HttpError(404, 'School account not found.');
      const latest = await prisma.officialEntryImport.findFirst({
        where: { source: 'PHOTO', sessionId, status: 'SUBMITTED', records: { some: { schoolId: school.id } } },
      });
      if (latest) throw new HttpError(409, 'Your official entry form is already waiting for review.');
      const created = await createImport(req, session, { schoolId: school.id, schoolName: school.name });
      res.status(201).json(publicImport(created));
    } catch (error) { next(error); }
  });

  portal.get('/official-entry-imports/:id/file', requirePermission('students.upload'), async (req, res, next) => {
    try {
      const item = await prisma.officialEntryImport.findFirst({
        where: { id: req.params.id, source: 'PHOTO', records: { some: { schoolId: req.user.schoolId } } },
      });
      if (!item) throw new HttpError(404, 'Official entry form not found.');
      await readOriginal(item, res);
    } catch (error) { next(error); }
  });
}

export function registerOfficialEntryStaff(staff) {
  staff.get('/official-entry-imports', requirePermission('students.view'), async (_req, res, next) => {
    try {
      const items = await prisma.officialEntryImport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: importInclude,
      });
      res.json({ items: items.map(publicImport) });
    } catch (error) { next(error); }
  });

  staff.post('/official-entry-imports', requirePermission('students.view'), uploadFile, async (req, res, next) => {
    try {
      const { sessionId, schoolName } = z.object({
        sessionId: z.string().min(1, 'Choose an examination session.'),
        schoolName: z.string().trim().max(200).optional(),
      }).parse(req.body);
      const session = await getSession(sessionId);
      const created = await createImport(req, session, { schoolName });
      res.status(201).json(publicImport(created));
    } catch (error) { next(error); }
  });

  staff.get('/official-entry-imports/:id', requirePermission('students.view'), async (req, res, next) => {
    try {
      const item = await prisma.officialEntryImport.findUnique({ where: { id: req.params.id }, include: importInclude });
      if (!item) throw new HttpError(404, 'Official entry form not found.');
      res.json(publicImport(item));
    } catch (error) { next(error); }
  });

  staff.get('/official-entry-imports/:id/file', requireEntryReview, async (req, res, next) => {
    try {
      const item = await prisma.officialEntryImport.findUnique({ where: { id: req.params.id } });
      if (!item) throw new HttpError(404, 'Official entry form not found.');
      await readOriginal(item, res);
    } catch (error) { next(error); }
  });

  staff.patch('/official-entry-imports/:id/records/:recordId', requirePermission('students.review'), async (req, res, next) => {
    try {
      const item = await prisma.officialEntryImport.findUnique({ where: { id: req.params.id } });
      if (!item) throw new HttpError(404, 'Official entry import not found.');
      if (item.status === 'APPROVED') throw new HttpError(409, 'Approved official entry data cannot be changed here.');
      const data = validateReviewedEntry(req.body);
      const record = await prisma.officialEntryRecord.findFirst({ where: { id: req.params.recordId, importId: item.id } });
      if (!record) throw new HttpError(404, 'School entry record not found.');
      if (record.schoolId && normalized(data.schoolName) !== normalized(record.schoolName)) {
        throw new HttpError(400, 'The verified school name must match the school linked to this entry.');
      }
      const matchedSchool = record.schoolId ? null : await prisma.school.findFirst({
        where: { name: { equals: data.schoolName, mode: 'insensitive' } },
        select: { id: true },
      });
      const updated = await prisma.officialEntryRecord.update({
        where: { id: record.id },
        data: { reviewedData: data, ...(matchedSchool ? { schoolId: matchedSchool.id } : {}) },
      });
      await logActivity(req, 'official_entries.record_reviewed', {
        entity: 'OfficialEntryRecord',
        entityId: record.id,
        after: { importId: item.id, subjectCount: data.subjects.length },
      });
      res.json({ id: updated.id, reviewedData: updated.reviewedData });
    } catch (error) { next(error); }
  });

  staff.post('/official-entry-imports/:id/records/:recordId/school', requirePermission('students.approve'), async (req, res, next) => {
    try {
      const { code } = z.object({
        code: z.string().trim().min(2, 'Enter a school code.').max(20, 'School codes must be 20 characters or fewer.'),
      }).parse(req.body);
      const item = await prisma.officialEntryImport.findUnique({ where: { id: req.params.id } });
      if (!item) throw new HttpError(404, 'Official entry import not found.');
      if (item.status === 'APPROVED') throw new HttpError(409, 'This official entry import is already approved.');
      const record = await prisma.officialEntryRecord.findFirst({
        where: { id: req.params.recordId, importId: item.id },
      });
      if (!record) throw new HttpError(404, 'School entry record not found.');
      if (record.schoolId) throw new HttpError(409, 'This entry is already linked to a school.');
      if (!record.reviewedData?.schoolName) throw new HttpError(409, 'Review and save the school name before adding this school.');

      const schoolName = String(record.reviewedData.schoolName).trim();
      const school = await prisma.$transaction(async (tx) => {
        const existing = await tx.school.findFirst({
          where: { name: { equals: schoolName, mode: 'insensitive' } },
        });
        if (existing) {
          await tx.officialEntryRecord.update({ where: { id: record.id }, data: { schoolId: existing.id } });
          return existing;
        }
        const created = await tx.school.create({ data: { code, name: schoolName } });
        await tx.officialEntryRecord.update({ where: { id: record.id }, data: { schoolId: created.id } });
        return created;
      });
      await logActivity(req, 'official_entries.school_linked', {
        entity: 'School',
        entityId: school.id,
        after: { code: school.code, name: school.name, importId: item.id, recordId: record.id },
      });
      res.status(201).json({ school: { id: school.id, code: school.code, name: school.name }, recordId: record.id });
    } catch (error) { next(error); }
  });

  staff.patch('/official-entry-imports/:id/review', async (req, res, next) => {
    try {
      const { status, note } = z.object({
        status: z.enum(['APPROVED', 'CHANGES_REQUIRED']),
        note: z.string().trim().max(1000).optional(),
      }).parse(req.body);
      const permission = status === 'APPROVED' ? 'students.approve' : 'students.review';
      if (!req.user.permissions.has(permission)) throw new HttpError(403, 'You do not have permission to review this official entry import.');
      const item = await prisma.officialEntryImport.findUnique({ where: { id: req.params.id }, include: { records: true } });
      if (!item) throw new HttpError(404, 'Official entry import not found.');
      if (item.status === 'APPROVED') throw new HttpError(409, 'This official entry import is already approved.');
      if (status === 'APPROVED') {
        if (item.records.length === 0 || item.records.some((record) => !record.reviewedData)) {
          throw new HttpError(400, 'Review and save every school entry summary before approving this import.');
        }
        await prisma.officialEntryImport.update({
          where: { id: item.id },
          data: { status, reviewedById: req.user.id, reviewedAt: new Date(), reviewNote: null },
        });
        await logActivity(req, 'official_entries.approved', {
          entity: 'OfficialEntryImport',
          entityId: item.id,
          after: { records: item.records.length },
        });
      } else {
        const reviewNote = note?.trim();
        if (!reviewNote || reviewNote.length < 3) throw new HttpError(400, 'Explain what needs to be corrected before returning the form.');
        await prisma.officialEntryImport.update({
          where: { id: item.id },
          data: { status, reviewNote, reviewedById: req.user.id, reviewedAt: new Date() },
        });
        await logActivity(req, 'official_entries.returned', { entity: 'OfficialEntryImport', entityId: item.id, after: { note: reviewNote } });
      }
      const updated = await prisma.officialEntryImport.findUnique({ where: { id: item.id }, include: importInclude });
      res.json(publicImport(updated));
    } catch (error) { next(error); }
  });
}
