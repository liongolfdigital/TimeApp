import { normalizeLookup, normalizeText } from "../employees/employeeModel.js";
import { DIARY_NOTE_TYPES } from "./diaryConstants.js";
import {
  getDiaryWeekday,
  normalizeDiaryDate,
  normalizeDiaryTimestamp,
} from "./diaryDateUtils.js";

export function createDiaryId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `diary-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripVietnameseMarks(value) {
  return normalizeLookup(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function normalizeViolationKey(value) {
  return stripVietnameseMarks(value).replace(/[\s/_-]+/g, " ");
}

const DIARY_NOTE_TYPE_LOOKUP = new Map(
  DIARY_NOTE_TYPES.map((option) => [normalizeViolationKey(option), option]),
);
const DIARY_VIOLATION_ALIASES = new Map([
  ["off > 2 ngay", "OFF"],
  ["off > 2", "OFF"],
]);

export function normalizeDiaryNoteType(value) {
  const key = normalizeViolationKey(value);
  return DIARY_NOTE_TYPE_LOOKUP.get(key) ?? DIARY_VIOLATION_ALIASES.get(key) ?? "";
}

export function normalizeDiaryNoteTypes(value) {
  let rawItems = [];
  if (Array.isArray(value)) {
    rawItems = value;
  } else {
    const text = normalizeText(value);
    if (!text) return [];
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        rawItems = Array.isArray(parsed) ? parsed : [];
      } catch {
        rawItems = [];
      }
    } else {
      rawItems = text.split(/[;,|]+/);
    }
  }
  const normalizedItems = rawItems.map(normalizeDiaryNoteType).filter(Boolean);
  if (normalizedItems.includes("OFF")) return ["OFF"];

  const selected = new Set();
  normalizedItems.forEach((type) => {
    if (type === "Đi trễ") selected.delete("Đi sớm");
    if (type === "Đi sớm") selected.delete("Đi trễ");
    if (type === "Về sớm") selected.delete("Tăng ca");
    if (type === "Tăng ca") selected.delete("Về sớm");

    // Xóa rồi thêm lại để giá trị xuất hiện sau cùng trong input thắng xung đột.
    selected.delete(type);
    selected.add(type);
  });
  return [...selected];
}

export function formatDiaryNoteTypes(value, emptyText = "") {
  const types = normalizeDiaryNoteTypes(value);
  return types.length ? types.join(", ") : emptyText;
}

export function toggleDiaryNoteType(currentTypes, nextType) {
  const selected = normalizeDiaryNoteTypes(currentTypes);
  const normalizedType = normalizeDiaryNoteType(nextType);
  if (!normalizedType) return selected;

  if (normalizedType === "OFF") {
    return selected.includes("OFF") ? [] : ["OFF"];
  }

  const withoutOff = selected.filter((type) => type !== "OFF");
  if (withoutOff.includes(normalizedType)) {
    return withoutOff.filter((type) => type !== normalizedType);
  }
  return normalizeDiaryNoteTypes([...withoutOff, normalizedType]);
}

export function isDiaryNoteTypeDisabled(currentTypes, type) {
  const normalizedType = normalizeDiaryNoteType(type);
  return Boolean(
    normalizedType
      && normalizedType !== "OFF"
      && normalizeDiaryNoteTypes(currentTypes).includes("OFF"),
  );
}

// Alias tương thích cho bộ xử lý chấm công và dữ liệu cũ.
export const normalizeDiaryViolationType = normalizeDiaryNoteType;
export const normalizeDiaryViolationTypes = normalizeDiaryNoteTypes;
export const formatDiaryViolationTypes = formatDiaryNoteTypes;

export function normalizeDiaryPermission(value) {
  if (value === true) return "Có phép";
  if (value === false) return "Không phép";
  const text = normalizeText(value);
  const normalized = stripVietnameseMarks(text).replace(/[\s/_-]+/g, " ");
  if (["co phep", "co", "yes", "true", "1"].includes(normalized)) return "Có phép";
  if (["khong phep", "khong", "no", "false", "0"].includes(normalized)) return "Không phép";
  return text;
}

export function normalizeDiaryEmployeeCode(value) {
  const code = normalizeLookup(value).replace(/\s+/g, "");
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
}

/** Chuẩn hóa giờ từ text, Excel serial hoặc Date về HH:mm. */
export function normalizeDiaryTime(value) {
  if (value === null || value === undefined || value === "") return "";

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const fraction = ((value % 1) + 1) % 1;
    const totalMinutes = Math.round(fraction * 24 * 60) % (24 * 60);
    return `${String(Math.floor(totalMinutes / 60)).padStart(2, "0")}:${String(totalMinutes % 60).padStart(2, "0")}`;
  }

  const text = normalizeText(value);
  const timeMatch = text.match(/^(\d{1,2}):(\d{1,2})(?::\d{1,2})?$/);
  if (timeMatch) {
    const hours = Number(timeMatch[1]);
    const minutes = Number(timeMatch[2]);
    return hours <= 23 && minutes <= 59
      ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
      : "";
  }

  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return normalizeDiaryTime(Number(text));
  }

  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? "" : normalizeDiaryTime(parsed);
}

/** Chuẩn hóa schema mới và đồng thời phát các alias cũ để không vỡ bộ xử lý chấm công. */
export function sanitizeDiaryEntry(entry = {}) {
  const date = normalizeDiaryDate(entry.date ?? entry["Ngày"]);
  const note = normalizeText(entry.note ?? entry.reason ?? entry["Ghi chú"]);
  const permissionStatus = normalizeDiaryPermission(
    entry.permissionStatus
      ?? entry.permission
      ?? entry.permissionType
      ?? entry.isPermitted
      ?? entry["Có/Không phép"],
  );
  const recordMaker = normalizeText(
    entry.recordMaker
      ?? entry.creatorName
      ?? entry.reporterName
      ?? entry.createdBy
      ?? entry["Người lập biên bản"],
  );
  const noteTypes = normalizeDiaryNoteTypes(
    entry.noteTypes
      ?? entry.noteType
      ?? entry.types
      ?? entry.type
      ?? entry.category
      ?? entry.violationTypes
      ?? entry.violation_types
      ?? entry.tags
      ?? entry["Loại ghi chú"],
  );
  const attachments = Array.isArray(entry.attachments)
    ? entry.attachments
    : Array.isArray(entry.attachedFiles)
      ? entry.attachedFiles
      : [];

  return {
    id: entry.id || createDiaryId(),
    date,
    employeeCode: normalizeText(entry.employeeCode ?? entry["Mã N.Viên"]),
    employeeName: normalizeText(entry.employeeName ?? entry["Tên N.Viên"]),
    checkIn1: normalizeDiaryTime(entry.checkIn1 ?? entry["Vào 1"]),
    checkOut1: normalizeDiaryTime(entry.checkOut1 ?? entry["Ra 1"]),
    checkIn2: normalizeDiaryTime(entry.checkIn2 ?? entry["Vào 2"]),
    checkOut2: normalizeDiaryTime(entry.checkOut2 ?? entry["Ra 2"]),
    note,
    permissionStatus,
    noteTypes,
    recordMaker,
    attachments,
    attachedFiles: attachments,
    branch: normalizeText(entry.branch),
    creatorCode: normalizeText(entry.creatorCode ?? entry.reporterCode),
    createdAt: normalizeDiaryTimestamp(entry.createdAt ?? entry.createdDate),
    updatedAt: normalizeDiaryTimestamp(entry.updatedAt ?? entry.updatedDate),

    // Compatibility aliases consumed by existing attendance and database code.
    weekday: normalizeText(entry.weekday) || getDiaryWeekday(date),
    reason: note,
    permission: permissionStatus,
    creatorName: recordMaker,
    bienBan: normalizeText(entry.bienBan ?? entry.report),
    violationTypes: noteTypes,
  };
}
