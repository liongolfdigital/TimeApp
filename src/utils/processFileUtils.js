import { detectBranchFromText, normalizeBranch } from "../branches/branchModel";
import {
  normalizeEmployeeCode,
  normalizeLookup,
} from "../employees/employeeModel";

export const MAX_PROCESS_FILE_SIZE = 25 * 1024 * 1024;
export const EXCEL_EXTENSION = /\.(xlsx|xls)$/i;
export const PROCESS_STATUS_LABELS = Object.freeze({
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  success: "Thành công",
  error: "Có lỗi",
});

export function createProcessQueueId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `process-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function makeProcessedFileName(fileName) {
  const baseName = String(fileName ?? "ket_qua").replace(EXCEL_EXTENSION, "");
  return `${baseName}_processed.xlsx`;
}

export function getEmployeeFilterKey(employee) {
  return normalizeEmployeeCode(employee.employeeCode) ||
    normalizeLookup(employee.employeeName) ||
    normalizeLookup(employee.id);
}

export function getEmployeeBranch(employee) {
  return normalizeBranch(employee.branch) || detectBranchFromText(employee.employeeName);
}

export function formatEmployeeBrief(employee) {
  return `${normalizeEmployeeCode(employee.employeeCode) || employee.employeeCode || "Chưa có mã"} - ${employee.employeeName || "Chưa có tên"}`;
}

export function validateProcessFile(file) {
  if (!EXCEL_EXTENSION.test(file.name)) return "Chỉ hỗ trợ file Excel .xlsx hoặc .xls.";
  if (file.size > MAX_PROCESS_FILE_SIZE) return "File vượt quá giới hạn 25 MB.";
  return "";
}
