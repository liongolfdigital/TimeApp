import { OUTPUT_FILE_NAME } from "../constants/excelConstants.js";

function sanitizeFileName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}

export function makeOutputFileName(branchName, now = new Date()) {
  const branch = sanitizeFileName(branchName) || "Chi_nhanh";
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `${branch}_bang_cham_cong_${timestamp}.xlsx`;
}

export function makeMergedOutputFileName(filters = {}, now = new Date()) {
  const scope = filters.employeeIds?.length
    ? "NhanVien"
    : filters.branches?.length ? "ChiNhanh" : "All";
  const timestamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("") + "_" + [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `XuLy_TongHop_${scope}_${timestamp}.xlsx`;
}

export { OUTPUT_FILE_NAME };
