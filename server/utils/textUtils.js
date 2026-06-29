import {
  detectBranchFromText as detectConfiguredBranchFromText,
  normalizeBranch as normalizeConfiguredBranch,
} from "../../src/branches/branchModel.js";

export function normalizeText(value) {
  return String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
}

export function normalizeUsername(value) {
  return normalizeText(value).toLocaleLowerCase("vi-VN");
}

export function normalizeBranch(value) {
  return normalizeConfiguredBranch(value);
}

export function normalizeLookup(value) {
  return normalizeText(value).toLocaleLowerCase("vi-VN");
}

export function normalizeEmployeeCode(value) {
  const normalized = normalizeLookup(value).replace(/\s+/g, "");
  return /^\d+$/.test(normalized) ? normalized.replace(/^0+(?=\d)/, "") : normalized;
}

export function detectBranchFromText(value) {
  return detectConfiguredBranchFromText(value);
}

/** Suy chi nhánh từ field chuẩn, alias import cũ rồi mới fallback sang mã/tên nhân viên. */
export function detectRecordBranch(record) {
  const directBranch = [
    record?.branch,
    record?.chiNhanh,
    record?.chi_nhanh,
    record?.store,
    record?.location,
    record?.["Chi nhánh"],
    record?.["CHI NHÁNH"],
    record?.["Chi Nhanh"],
    record?.["CHI NHANH"],
  ].map(detectBranchFromText).find(Boolean);
  if (directBranch) return directBranch;

  return [
    record?.employeeCode,
    record?.code,
    record?.maNhanVien,
    record?.ma_nhan_vien,
    record?.["Mã N.viên"],
    record?.["MÃ N.VIÊN"],
    record?.["Ma N.vien"],
    record?.["MA N.VIEN"],
    record?.employeeName,
    record?.name,
    record?.fullName,
    record?.["Tên N.viên"],
    record?.["TÊN N.VIÊN"],
    record?.["Ten N.vien"],
    record?.["TEN N.VIEN"],
  ].map(detectBranchFromText).find(Boolean) || "";
}
