import ExcelJS from 'exceljs';
import { Readable } from 'node:stream';
import os from 'node:os';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import englishModel from '@tesseract.js-data/eng';
import { HttpError } from './middleware.js';

const UCE_SUBJECTS = [
  ['112', 'English'], ['208', 'Literature in English'], ['223', 'CRE'], ['241', 'History'],
  ['273', 'Geography'], ['314', 'French'], ['335', 'Luganda'], ['336', 'Lugha ya Kiswahili'],
  ['456', 'Mathematics'], ['527', 'Agriculture'], ['535', 'Physics'], ['545', 'Chemistry'],
  ['553', 'Biology'], ['612', 'Art'], ['662', 'Foods and Nutrition'], ['735', 'Technical Drawing'],
  ['800', 'Commerce'], ['810', 'Principles of Accounts'], ['845', 'Entrepreneurship'], ['840', 'Computer Studies'],
];

export function sniffOfficialEntryFile(buffer) {
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) return 'xlsx';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'png';
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';
  return null;
}

function normalizedName(value) {
  return String(value || '').trim().toLocaleLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function cellText(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text ?? value.result ?? '').trim();
  return String(value).trim();
}

function paperCount(value) {
  const parsed = Number(cellText(value).replace(/,/g, ''));
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export async function extractUaceWorkbook(buffer) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.read(Readable.from(buffer));
  } catch {
    throw new HttpError(400, 'We could not read this Excel file. Please upload the official UACE workbook as .xlsx.');
  }

  const sheets = ['ARTS', 'SCIENCES'].map((name) => workbook.getWorksheet(name));
  if (sheets.some((sheet) => !sheet)) {
    throw new HttpError(400, 'The workbook must contain both official ARTS and SCIENCES sheets.');
  }

  const titleText = sheets.flatMap((sheet) => [1, 2].map((row) => sheet.getRow(row).values.map(cellText).join(' '))).join(' ');
  const year = titleText.match(/\b20\d{2}\b/)?.[0];
  if (!year) throw new HttpError(400, 'The UACE workbook year could not be identified from its title.');

  const records = new Map();
  for (const sheet of sheets) {
    let schoolColumn = 0;
    for (let rowNumber = 1; rowNumber <= 5 && !schoolColumn; rowNumber++) {
      sheet.getRow(rowNumber).eachCell((cell, column) => {
        if (cellText(cell.value).toUpperCase() === 'SCHOOL NAME') schoolColumn = column;
      });
    }
    if (!schoolColumn) throw new HttpError(400, `The ${sheet.name} sheet is missing the SCHOOL NAME column.`);

    const subjectsByColumn = new Map();
    for (let column = schoolColumn + 1; column <= sheet.columnCount; column++) {
      const heading = cellText(sheet.getRow(2).getCell(column).value);
      const paperNumber = paperCount(sheet.getRow(3).getCell(column).value);
      const match = heading.match(/^(.+?)\s*\(([^()]+)\)\s*$/);
      if (match && paperNumber !== null && paperNumber > 0) {
        subjectsByColumn.set(column, {
          code: match[2].trim().toUpperCase(),
          name: match[1].trim(),
          paperNumber,
        });
      }
    }

    for (let rowNumber = 4; rowNumber <= sheet.rowCount; rowNumber++) {
      const schoolName = cellText(sheet.getRow(rowNumber).getCell(schoolColumn).value);
      if (!schoolName || schoolName.toUpperCase() === 'SCHOOL NAME') continue;
      const key = normalizedName(schoolName);
      if (!key || key === 'total entries') continue;

      let record = records.get(key);
      if (!record) {
        record = { schoolName, centreName: null, centreNumber: null, totalCandidates: null, district: null, zone: null, subjects: [], warnings: [] };
        records.set(key, record);
      }

      for (const [column, subject] of subjectsByColumn) {
        const count = paperCount(sheet.getRow(rowNumber).getCell(column).value);
        if (count === null) continue;
        let subjectRecord = record.subjects.find((item) => item.code === subject.code);
        if (!subjectRecord) {
          subjectRecord = { code: subject.code, name: subject.name, entries: null, papers: [] };
          record.subjects.push(subjectRecord);
        }
        const existing = subjectRecord.papers.find((paper) => paper.number === subject.paperNumber);
        if (existing && existing.count !== count) {
          record.warnings.push(`Conflicting ${sheet.name} totals for ${subject.code} paper ${subject.paperNumber}; verify against the source form.`);
        } else if (!existing) {
          subjectRecord.papers.push({ number: subject.paperNumber, count });
        }
      }
    }
  }

  const parsed = [...records.values()].filter((record) => record.subjects.some((subject) => subject.papers.some((paper) => paper.count > 0)));
  if (!parsed.length) throw new HttpError(400, 'No school entry totals were found in the ARTS or SCIENCES sheets.');
  for (const record of parsed) {
    record.subjects = record.subjects.filter((subject) => subject.papers.some((paper) => paper.count > 0));
    record.subjects.sort((a, b) => a.code.localeCompare(b.code));
    for (const subject of record.subjects) subject.papers.sort((a, b) => a.number - b.number);
  }
  return { formType: 'UACE_GENERAL', year: Number(year), records: parsed };
}

function uceTemplate() {
  return UCE_SUBJECTS.map(([code, name]) => ({
    code,
    name,
    entries: null,
    papers: Array.from({ length: 7 }, (_, index) => ({ number: index + 1, count: null })),
  }));
}

export async function recognizeOfficialEntryPhoto(buffer, sessionSubjects = []) {
  const worker = await createWorker('eng', 1, {
    langPath: englishModel.langPath,
    cachePath: path.join(os.tmpdir(), 'aceiteka-ocr-cache'),
    gzip: englishModel.gzip,
    logger: () => {},
  });

  let text;
  let confidence;
  try {
    const result = await worker.recognize(buffer, {}, { text: true });
    text = result.data.text.toUpperCase();
    confidence = Math.round(result.data.confidence);
  } finally {
    await worker.terminate();
  }

  const hasUceSummary = /\bU\s*C\s*E\b/.test(text) && /SUMMARY\s+OF\s+ENTRIES/.test(text);
  const hasUaceSummary = /\bU\s*A\s*C\s*E\b/.test(text) && /GENERAL\s+ENTRY/.test(text);
  if (!hasUceSummary && !hasUaceSummary) {
    throw new HttpError(400, 'This image was not recognized as an ACEITEKA UCE or UACE entry summary. Upload a clear photo of the official form.');
  }

  const year = Number(text.match(/\b20\d{2}\b/)?.[0]) || null;
  const formType = hasUceSummary ? 'UCE_SUMMARY' : 'UACE_GENERAL';
  const subjects = hasUceSummary
    ? uceTemplate()
    : sessionSubjects.map(({ subject }) => ({
      code: subject.code,
      name: subject.name,
      entries: null,
      papers: subject.papers.map((paper) => ({ number: paper.number, count: null })),
    }));

  return {
    formType,
    year,
    ocrConfidence: confidence,
    records: [{
      schoolName: '',
      centreName: '',
      centreNumber: '',
      totalCandidates: null,
      district: '',
      zone: '',
      subjects,
      warnings: ['Handwritten counts and school details must be entered or corrected by a person against the original image before approval.'],
    }],
  };
}

export function validateReviewedEntry(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new HttpError(400, 'Enter the reviewed school entry summary.');
  const schoolName = String(data.schoolName || '').trim();
  if (!schoolName || schoolName.length > 200) throw new HttpError(400, 'Enter the school name from the official form.');
  const totalCandidates = data.totalCandidates === null || data.totalCandidates === '' ? null : Number(data.totalCandidates);
  if (totalCandidates !== null && (!Number.isSafeInteger(totalCandidates) || totalCandidates < 0)) throw new HttpError(400, 'Candidate total must be a whole number of zero or more.');
  if (!Array.isArray(data.subjects) || !data.subjects.length) throw new HttpError(400, 'Review at least one subject and its paper counts.');
  const seen = new Set();
  const subjects = data.subjects.map((subject) => {
    const code = String(subject.code || '').trim().toUpperCase();
    const name = String(subject.name || '').trim();
    if (!code || !name) throw new HttpError(400, 'Each subject needs a code and name.');
    if (seen.has(code)) throw new HttpError(400, `Subject ${code} appears more than once.`);
    seen.add(code);
    const entries = subject.entries === null || subject.entries === '' ? null : Number(subject.entries);
    if (entries !== null && (!Number.isSafeInteger(entries) || entries < 0)) throw new HttpError(400, `Enter a whole-number entry count for ${code}.`);
    if (!Array.isArray(subject.papers) || !subject.papers.length) throw new HttpError(400, `Review paper counts for ${code}.`);
    const paperNumbers = new Set();
    const papers = subject.papers.map((paper) => {
      const number = Number(paper.number);
      const count = paper.count === null || paper.count === '' ? null : Number(paper.count);
      if (!Number.isSafeInteger(number) || number < 1 || paperNumbers.has(number)) throw new HttpError(400, `Paper numbers for ${code} must be unique positive whole numbers.`);
      if (count === null || !Number.isSafeInteger(count) || count < 0) throw new HttpError(400, `Enter a whole-number count for ${code} paper ${number}.`);
      if (totalCandidates !== null && count > totalCandidates) throw new HttpError(400, `${code} paper ${number} exceeds the total number of candidates.`);
      if (entries !== null && count > entries) throw new HttpError(400, `${code} paper ${number} exceeds the subject entry total.`);
      paperNumbers.add(number);
      return { number, count };
    });
    return { code, name, entries, papers };
  });
  return {
    schoolName,
    centreName: String(data.centreName || '').trim().slice(0, 200),
    centreNumber: String(data.centreNumber || '').trim().slice(0, 60),
    totalCandidates,
    district: String(data.district || '').trim().slice(0, 120),
    zone: String(data.zone || '').trim().slice(0, 120),
    subjects,
  };
}
