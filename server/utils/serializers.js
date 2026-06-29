import { normalizeDiaryViolationTypes } from "../../src/diary/diaryModel.js";
import { normalizeText, normalizeUsername } from "./textUtils.js";
import { toDateText, toIso } from "./dateUtils.js";

function parsePayload(row) {
  if (!row?.payload) return {};
  if (typeof row.payload === "object") return row.payload;
  try {
    return JSON.parse(row.payload || "{}");
  } catch {
    return {};
  }
}

export function canonicalRole(value) {
  const role = normalizeUsername(value);
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  return normalizeText(value);
}

export function serializeAccount(row) {
  return {
    id: row.id,
    username: row.username,
    fullName: row.full_name,
    role: canonicalRole(row.role),
    branch: row.branch,
    status: row.status,
    createdAt: toIso(row.created_at),
    createdBy: row.created_by,
  };
}

export function serializeEmployeeRow(row) {
  const payload = parsePayload(row);
  return {
    ...payload,
    id: row.id,
    branch: row.branch ?? payload.branch ?? "",
    employeeCode: payload.employeeCode ?? row.employee_code ?? "",
    employeeName: payload.employeeName ?? row.employee_name ?? "",
    registeredShift: payload.registeredShift ?? row.registered_shift ?? "",
    morningIn: payload.morningIn ?? row.morning_in ?? "",
    morningOut: payload.morningOut ?? row.morning_out ?? "",
    afternoonIn: payload.afternoonIn ?? row.afternoon_in ?? "",
    afternoonOut: payload.afternoonOut ?? row.afternoon_out ?? "",
    eveningIn: payload.eveningIn ?? row.evening_in ?? "",
    eveningOut: payload.eveningOut ?? row.evening_out ?? "",
    fullIn: payload.fullIn ?? row.full_in ?? "",
    fullOut: payload.fullOut ?? row.full_out ?? "",
    note: payload.note ?? row.note ?? "",
    createdAt: payload.createdAt || toIso(row.created_at),
    updatedAt: payload.updatedAt || toIso(row.updated_at),
  };
}

export function serializeDiaryRow(row) {
  const payload = parsePayload(row);
  const violationTypes = normalizeDiaryViolationTypes(
    payload.violationTypes ?? payload.violation_types ?? row.violation_types,
  );
  return {
    ...payload,
    id: row.id,
    branch: row.branch ?? payload.branch ?? "",
    weekday: payload.weekday ?? row.weekday ?? "",
    date: payload.date || toDateText(row.date),
    employeeCode: payload.employeeCode ?? row.employee_code ?? "",
    employeeName: payload.employeeName ?? row.employee_name ?? "",
    reason: payload.reason ?? row.reason ?? "",
    permission: payload.permission ?? row.permission ?? "",
    violationTypes,
    creatorCode: payload.creatorCode ?? row.creator_code ?? "",
    creatorName: payload.creatorName ?? row.creator_name ?? "",
    createdAt: payload.createdAt || toIso(row.created_at),
    updatedAt: payload.updatedAt || toIso(row.updated_at),
  };
}

export function serializeAttachment(row) {
  return {
    id: row.id,
    diaryEntryId: row.diary_entry_id,
    fileName: row.file_name,
    fileType: row.file_type,
    fileSize: row.file_size,
    filePath: `/api/attachments/${row.id}/content`,
    blobUrl: row.blob_url,
    uploadedBy: row.uploaded_by,
    uploadedByAccountId: row.uploaded_by_account_id,
    uploadedByUsername: row.uploaded_by_username,
    uploadedDate: toIso(row.uploaded_date || row.created_at),
    branch: row.branch,
  };
}
