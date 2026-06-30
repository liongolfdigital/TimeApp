import { normalizeLookup, normalizeText } from "../employees/employeeModel.js";
import { normalizeDiaryDate, normalizeDiaryTimestamp } from "./diaryDateUtils.js";
import {
  normalizeDiaryEmployeeCode,
  normalizeDiaryPermission,
  normalizeDiaryViolationType,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
} from "./diaryNormalizers.js";

export function createDiaryLookup(entries) {
  const byCodeAndDate = new Map();
  const byNameAndDate = new Map();
  entries.map((entry) => ({
    ...sanitizeDiaryEntry(entry),
    attachedFiles: entry.attachedFiles ?? entry.attachments ?? [],
  })).forEach((entry) => {
    if (!entry.date) return;
    const code = normalizeDiaryEmployeeCode(entry.employeeCode);
    const name = normalizeLookup(entry.employeeName);
    if (code) {
      const key = `${entry.date}|${code}`;
      byCodeAndDate.set(key, [...(byCodeAndDate.get(key) ?? []), entry]);
    }
    if (name) {
      const key = `${entry.date}|${name}`;
      byNameAndDate.set(key, [...(byNameAndDate.get(key) ?? []), entry]);
    }
  });
  return { byCodeAndDate, byNameAndDate };
}

export function findDiaryEntry(lookup, { date, employeeCode, employeeName }) {
  const normalizedDate = normalizeDiaryDate(date);
  if (!normalizedDate) return null;
  const code = normalizeDiaryEmployeeCode(employeeCode);
  const codeMatches = code ? lookup.byCodeAndDate.get(`${normalizedDate}|${code}`) : null;
  const codeEntry = codeMatches?.find(({ reason }) => Boolean(normalizeText(reason)));
  if (codeEntry) return { entry: codeEntry, matchType: "employeeCode" };
  const name = normalizeLookup(employeeName);
  const nameMatches = name ? lookup.byNameAndDate.get(`${normalizedDate}|${name}`) : null;
  const nameEntry = nameMatches?.find(({ reason }) => Boolean(normalizeText(reason)));
  return nameEntry ? { entry: nameEntry, matchType: "employeeName" } : null;
}


function hasDiaryClockValues(entry) {
  return [entry?.checkIn1, entry?.checkOut1, entry?.checkIn2, entry?.checkOut2]
    .some((value) => Boolean(normalizeText(value)));
}

function getDiaryCandidatesByIdentity(lookup, { date, employeeCode, employeeName } = {}) {
  const normalizedDate = normalizeDiaryDate(date);
  if (!normalizedDate) return [];
  const seen = new Set();
  const candidates = [];
  const pushMatches = (matches = [], matchType) => {
    matches.forEach((entry) => {
      const key = entry.id || `${entry.date}|${entry.employeeCode}|${entry.employeeName}|${entry.createdAt}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push({ entry, matchType });
    });
  };

  const code = normalizeDiaryEmployeeCode(employeeCode);
  const codeMatches = code ? lookup.byCodeAndDate.get(`${normalizedDate}|${code}`) : null;
  pushMatches(codeMatches ?? [], "employeeCode");

  const name = normalizeLookup(employeeName);
  const nameMatches = name ? lookup.byNameAndDate.get(`${normalizedDate}|${name}`) : null;
  pushMatches(nameMatches ?? [], "employeeName");

  return candidates;
}

function diarySortTimestamp(entry) {
  const updated = normalizeDiaryTimestamp(entry?.updatedAt ?? entry?.updatedDate);
  const created = normalizeDiaryTimestamp(entry?.createdAt ?? entry?.createdDate);
  return new Date(updated || created || 0).getTime() || 0;
}

export function findDiaryForViolation(lookup, {
  date,
  employeeCode,
  employeeName,
  violationType,
} = {}) {
  const normalizedDate = normalizeDiaryDate(date);
  const normalizedType = normalizeDiaryViolationType(violationType);
  if (!normalizedDate || !normalizedType) return null;
  const code = normalizeDiaryEmployeeCode(employeeCode);
  const name = normalizeLookup(employeeName);
  const candidates = code
    ? lookup.byCodeAndDate.get(`${normalizedDate}|${code}`)
    : name
      ? lookup.byNameAndDate.get(`${normalizedDate}|${name}`)
      : null;
  const typedMatches = (candidates ?? []).filter((entry) =>
    normalizeDiaryViolationTypes(entry.noteTypes ?? entry.violationTypes).includes(normalizedType));
  // Excel có thể không có "Loại ghi chú"; dùng dòng không phân loại làm
  // fallback chung, còn dòng đã chọn loại vẫn được ưu tiên.
  const genericMatches = (candidates ?? []).filter((entry) =>
    !normalizeDiaryViolationTypes(entry.noteTypes ?? entry.violationTypes).length
    && Boolean(normalizeText(entry.note ?? entry.reason)));
  const matched = (typedMatches.length ? typedMatches : genericMatches)
    .sort((first, second) => diarySortTimestamp(second) - diarySortTimestamp(first));
  if (!matched.length) return null;
  return { entry: matched[0], matchType: code ? "employeeCode" : "employeeName" };
}


export function findDiaryTimeEntry(lookup, { date, employeeCode, employeeName } = {}) {
  const matched = getDiaryCandidatesByIdentity(lookup, {
    date,
    employeeCode,
    employeeName,
  })
    .filter(({ entry }) => hasDiaryClockValues(entry))
    .sort((first, second) => diarySortTimestamp(second.entry) - diarySortTimestamp(first.entry));
  if (!matched.length) return null;
  return matched[0];
}

export function isDiaryPermitted(entry) {
  return normalizeDiaryPermission(entry?.permission) === "Có phép";
}

export function hasDiaryAttachments(entry) {
  const files = entry?.attachedFiles ?? entry?.attachments;
  return Array.isArray(files) && files.length > 0;
}

export function buildDiaryNote(entry) {
  const parts = [normalizeText(entry.reason)];
  const permission = normalizeDiaryPermission(entry.permission);
  if (permission) parts.push(permission);
  if (entry.bienBan) parts.push(normalizeText(entry.bienBan));
  parts.push(hasDiaryAttachments(entry) ? "Có hồ sơ đính kèm" : "Chưa bổ sung hồ sơ");
  if (entry.creatorName) parts.push(`Người lập: ${normalizeText(entry.creatorName)}`);
  return parts.join(" - ");
}
