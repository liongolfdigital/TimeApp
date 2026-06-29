import { normalizeLookup, normalizeText } from "../employees/employeeModel.js";
import { DIARY_VIOLATION_OPTIONS } from "./diaryConstants.js";
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

const DIARY_VIOLATION_LOOKUP = new Map(
  DIARY_VIOLATION_OPTIONS.map((option) => [normalizeViolationKey(option), option]),
);
const DIARY_VIOLATION_ALIASES = new Map([
  ["off > 2 ngay", "OFF"],
  ["off > 2", "OFF"],
]);

export function normalizeDiaryViolationType(value) {
  const key = normalizeViolationKey(value);
  return DIARY_VIOLATION_LOOKUP.get(key) ?? DIARY_VIOLATION_ALIASES.get(key) ?? "";
}

export function normalizeDiaryViolationTypes(value) {
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
  return [...new Set(rawItems.map(normalizeDiaryViolationType).filter(Boolean))];
}

export function formatDiaryViolationTypes(value, emptyText = "") {
  const types = normalizeDiaryViolationTypes(value);
  return types.length ? types.join(", ") : emptyText;
}

export function normalizeDiaryPermission(value) {
  const text = normalizeText(value);
  const normalized = stripVietnameseMarks(text).replace(/[\s/_-]+/g, " ");
  if (["co phep", "co", "yes", "1"].includes(normalized)) return "Có phép";
  if (["khong phep", "khong", "no", "0"].includes(normalized)) return "Không phép";
  return text;
}

export function normalizeDiaryEmployeeCode(value) {
  const code = normalizeLookup(value).replace(/\s+/g, "");
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
}

export function sanitizeDiaryEntry(entry) {
  const date = normalizeDiaryDate(entry.date);
  const violationTypes = normalizeDiaryViolationTypes(
    entry.violationTypes ?? entry.violation_types ?? entry.tags,
  );
  return {
    id: entry.id || createDiaryId(),
    weekday: normalizeText(entry.weekday) || getDiaryWeekday(date),
    date,
    employeeCode: normalizeText(entry.employeeCode),
    employeeName: normalizeText(entry.employeeName),
    reason: normalizeText(entry.reason),
    bienBan: normalizeText(entry.bienBan ?? entry.report),
    branch: normalizeText(entry.branch),
    permission: normalizeDiaryPermission(entry.permission),
    violationTypes,
    creatorCode: normalizeText(entry.creatorCode ?? entry.reporterCode),
    creatorName: normalizeText(entry.creatorName ?? entry.reporterName ?? entry.createdBy),
    createdAt: normalizeDiaryTimestamp(entry.createdAt ?? entry.createdDate),
    updatedAt: normalizeDiaryTimestamp(entry.updatedAt ?? entry.updatedDate),
  };
}
