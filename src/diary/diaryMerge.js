import { normalizeLookup } from "../employees/employeeModel.js";
import { normalizeDiaryDate } from "./diaryDateUtils.js";
import {
  normalizeDiaryEmployeeCode,
  sanitizeDiaryEntry,
} from "./diaryNormalizers.js";

export function getDiaryIdentity(entry) {
  const code = normalizeDiaryEmployeeCode(entry.employeeCode);
  const name = normalizeLookup(entry.employeeName);
  const person = code ? `code:${code}` : name ? `name:${name}` : `id:${entry.id ?? ""}`;
  const branch = normalizeLookup(entry.branch);
  return `${branch}|${normalizeDiaryDate(entry.date)}|${person}`;
}

function preserveImportedInternalFields(existing, imported) {
  const permissionStatus = imported.permissionStatus || existing?.permissionStatus || "";
  const recordMaker = imported.recordMaker || existing?.recordMaker || "";
  const attachments = existing?.attachments?.length
    ? existing.attachments
    : imported.attachments;
  const attachedFiles = existing?.attachedFiles?.length
    ? existing.attachedFiles
    : attachments;
  const noteTypes = imported.noteTypes.length
    ? imported.noteTypes
    : existing?.noteTypes ?? existing?.violationTypes ?? [];

  return {
    permissionStatus,
    permission: permissionStatus,
    recordMaker,
    creatorName: recordMaker,
    creatorCode: imported.creatorCode || existing?.creatorCode || "",
    attachments,
    attachedFiles,
    noteTypes,
    violationTypes: noteTypes,
    bienBan: imported.bienBan || existing?.bienBan || "",
  };
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
      ...preserveImportedInternalFields(existing, sanitized),
      id: existing?.id || sanitized.id,
      createdAt,
      updatedAt: sanitized.updatedAt || now,
    });
  });
  return Array.from(merged.values());
}
