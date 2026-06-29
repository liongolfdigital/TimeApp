import { normalizeLookup } from "../employees/employeeModel.js";
import { normalizeDiaryDate } from "./diaryDateUtils.js";
import {
  normalizeDiaryEmployeeCode,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
} from "./diaryNormalizers.js";

export function getDiaryIdentity(entry) {
  const code = normalizeDiaryEmployeeCode(entry.employeeCode);
  const name = normalizeLookup(entry.employeeName);
  const person = code ? `code:${code}` : `name:${name}`;
  const branch = normalizeLookup(entry.branch);
  const violationTypes = normalizeDiaryViolationTypes(entry.violationTypes)
    .map(normalizeLookup)
    .sort()
    .join(",");
  return `${branch}|${normalizeDiaryDate(entry.date)}|${person}|${normalizeLookup(entry.reason)}|${violationTypes}`;
}

export function mergeDiaryEntries(currentEntries, importedEntries) {
  const now = new Date().toISOString();
  const merged = new Map(
    currentEntries.map((entry) => {
      const sanitized = sanitizeDiaryEntry(entry);
      const createdAt = sanitized.createdAt || now;
      return [getDiaryIdentity(sanitized), {
        ...sanitized,
        createdAt,
        updatedAt: sanitized.updatedAt || createdAt,
      }];
    }),
  );
  importedEntries.forEach((entry) => {
    const sanitized = sanitizeDiaryEntry(entry);
    const identity = getDiaryIdentity(sanitized);
    const existing = merged.get(identity);
    const createdAt = existing?.createdAt || sanitized.createdAt || now;
    merged.set(identity, {
      ...existing,
      ...sanitized,
      id: existing?.id || sanitized.id,
      creatorCode: sanitized.creatorCode || existing?.creatorCode || "",
      creatorName: sanitized.creatorName || existing?.creatorName || "",
      createdAt,
      updatedAt: sanitized.updatedAt || now,
    });
  });
  return Array.from(merged.values());
}
