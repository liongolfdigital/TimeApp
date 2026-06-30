import {
  createDiaryId,
  DIARY_EXPORT_FILE_NAME,
  DIARY_EXPORT_FIELDS,
  DIARY_IMPORT_FIELDS,
  DIARY_REQUIRED_IMPORT_KEYS,
  DIARY_SHEET_NAME,
  formatDiaryDate,
  formatDiaryNoteTypes,
  normalizeDiaryDate,
  normalizeDiaryTime,
  sanitizeDiaryEntry,
} from "./diaryModel.js";
import { normalizeText } from "../employees/employeeModel.js";

let xlsxModulePromise;

async function loadXlsx() {
  xlsxModulePromise ??= import("xlsx");
  return xlsxModulePromise;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .toLocaleLowerCase("vi-VN")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const HEADER_ALIASES = DIARY_IMPORT_FIELDS.flatMap((field) =>
  [field.label, ...(field.aliases ?? [])].map((label) => ({
    key: field.key,
    normalized: normalizeHeader(label),
  })),
);

function resolveHeaderKey(value) {
  const normalized = normalizeHeader(value);
  if (!normalized) return "";
  const exact = HEADER_ALIASES.find((alias) => alias.normalized === normalized);
  if (exact) return exact.key;
  // File chấm công thực tế thường thêm hướng dẫn trong ngoặc sau "Ghi chú".
  const noteAlias = HEADER_ALIASES.find(
    ({ key, normalized: alias }) => key === "note" && normalized.startsWith(`${alias} `),
  );
  return noteAlias?.key ?? "";
}

function getCell(XLSX, worksheet, row, column) {
  return worksheet[XLSX.utils.encode_cell({ r: row, c: column })];
}

function getCellText(XLSX, worksheet, row, column) {
  const cell = getCell(XLSX, worksheet, row, column);
  return normalizeText(cell ? XLSX.utils.format_cell(cell) : "");
}

function mapHeaderColumns(XLSX, worksheet, headerRow, bounds) {
  const columns = new Map();
  for (let column = bounds.s.c; column <= bounds.e.c; column += 1) {
    const cell = getCell(XLSX, worksheet, headerRow, column);
    const key = resolveHeaderKey(cell?.v ?? cell?.w);
    if (key && !columns.has(key)) columns.set(key, column);
  }
  return columns;
}

function findDiaryWorksheet(XLSX, workbook) {
  let bestMatch = null;

  workbook.SheetNames.forEach((sheetName, sheetIndex) => {
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet?.["!ref"]) return;
    const bounds = XLSX.utils.decode_range(worksheet["!ref"]);
    const lastRow = Math.min(bounds.e.r, bounds.s.r + 49);

    for (let row = bounds.s.r; row <= lastRow; row += 1) {
      const columns = mapHeaderColumns(XLSX, worksheet, row, bounds);
      const hasRequired = DIARY_REQUIRED_IMPORT_KEYS.every((key) => columns.has(key));
      if (!hasRequired) continue;
      const candidate = {
        bounds,
        columns,
        headerRow: row,
        score: columns.size,
        sheetIndex,
        sheetName,
        worksheet,
      };
      if (
        !bestMatch
        || candidate.score > bestMatch.score
        || (candidate.score === bestMatch.score && sheetIndex < bestMatch.sheetIndex)
      ) {
        bestMatch = candidate;
      }
    }
  });

  if (!bestMatch) {
    const requiredLabels = DIARY_IMPORT_FIELDS
      .filter(({ key }) => DIARY_REQUIRED_IMPORT_KEYS.includes(key))
      .map(({ label }) => label);
    throw new Error(
      `Không tìm thấy sheet có đủ cột Diary trong 50 dòng đầu: ${requiredLabels.join(", ")}.`,
    );
  }
  return bestMatch;
}

function readFieldValue(XLSX, worksheet, row, column, type) {
  const cell = getCell(XLSX, worksheet, row, column);
  const formatted = getCellText(XLSX, worksheet, row, column);
  if (type === "date") {
    return normalizeDiaryDate(formatted) || normalizeDiaryDate(cell?.v);
  }
  if (type === "time") {
    return normalizeDiaryTime(formatted) || normalizeDiaryTime(cell?.v);
  }
  return formatted;
}

/** Đọc workbook Diary theo header, không phụ thuộc tên sheet hay vị trí dòng tiêu đề. */
export async function importDiaryFromExcel(file) {
  if (!file?.name?.toLocaleLowerCase().endsWith(".xlsx")) {
    throw new Error("Vui lòng chọn file Diary định dạng .xlsx.");
  }

  const XLSX = await loadXlsx();
  let workbook;
  try {
    workbook = XLSX.read(await file.arrayBuffer(), {
      type: "array",
      cellDates: true,
      cellNF: true,
      cellText: true,
    });
  } catch {
    throw new Error("Không thể đọc file Diary.");
  }

  const {
    bounds,
    columns,
    headerRow,
    worksheet,
  } = findDiaryWorksheet(XLSX, workbook);
  const entries = [];

  for (let row = headerRow + 1; row <= bounds.e.r; row += 1) {
    const raw = { id: createDiaryId() };
    DIARY_IMPORT_FIELDS.forEach(({ key, type }) => {
      const column = columns.get(key);
      raw[key] = column === undefined
        ? ""
        : readFieldValue(XLSX, worksheet, row, column, type);
    });
    if (
      raw.date
      || raw.employeeCode
      || raw.employeeName
      || raw.checkIn1
      || raw.checkOut1
      || raw.note
    ) {
      entries.push(sanitizeDiaryEntry(raw));
    }
  }

  if (!entries.length) {
    throw new Error("File không có dòng Diary hợp lệ để import.");
  }
  return entries;
}

function formatAttachmentExport(entry) {
  const attachments = entry.attachments ?? entry.attachedFiles ?? [];
  if (!Array.isArray(attachments)) return "";
  return attachments
    .map((attachment) => attachment?.fileName ?? attachment?.name ?? "")
    .filter(Boolean)
    .join("; ");
}

export function buildDiaryExportRows(entries) {
  return [
    DIARY_EXPORT_FIELDS.map(({ label }) => label),
    ...entries.map((entry) => {
      const sanitized = sanitizeDiaryEntry(entry);
      return DIARY_EXPORT_FIELDS.map(({ key, type }) => {
        if (type === "date") return formatDiaryDate(sanitized[key]);
        if (type === "time") return normalizeDiaryTime(sanitized[key]);
        if (type === "noteTypes") return formatDiaryNoteTypes(sanitized[key]);
        if (type === "attachments") return formatAttachmentExport(entry);
        return sanitized[key] ?? "";
      });
    }),
  ];
}

export async function createDiaryExportWorkbook(entries) {
  const XLSX = await loadXlsx();
  const rows = buildDiaryExportRows(entries);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  worksheet["!cols"] = DIARY_EXPORT_FIELDS.map(({ key }) => ({
    wch: key === "note"
      ? 36
      : key === "employeeName" || key === "recordMaker" || key === "attachments"
        ? 24
        : 16,
  }));
  worksheet["!autofilter"] = { ref: worksheet["!ref"] };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, DIARY_SHEET_NAME);
  return { XLSX, workbook };
}

export async function exportDiaryToExcel(entries) {
  if (!entries.length) throw new Error("Danh sách Diary đang trống.");
  const { XLSX, workbook } = await createDiaryExportWorkbook(entries);
  const output = XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    compression: true,
  });
  const url = URL.createObjectURL(new Blob([output], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  const link = document.createElement("a");
  link.href = url;
  link.download = DIARY_EXPORT_FILE_NAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
