import { OUTPUT_FILE_NAME } from "../constants/excelConstants.js";

function sanitizeFileName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}

function monthKeyFromDate(date) {
  const safeDate = date instanceof Date && !Number.isNaN(date.getTime())
    ? date
    : new Date();
  return [
    safeDate.getFullYear(),
    String(safeDate.getMonth() + 1).padStart(2, "0"),
  ].join("-");
}

export function getMonthKeyFromDayKey(dayKey) {
  const match = String(dayKey ?? "").match(/^(\d{4}-\d{2})-\d{2}$/);
  return match?.[1] ?? "";
}

export function getLatestMonthKey(rowResults = [], fallbackDate = new Date()) {
  const monthKeys = (rowResults ?? [])
    .map((rowResult) => getMonthKeyFromDayKey(rowResult?.dayKey))
    .filter(Boolean)
    .sort();
  return monthKeys.at(-1) || monthKeyFromDate(fallbackDate);
}

function makeBranchPart(branchName) {
  return sanitizeFileName(branchName) || "Chi_nhanh";
}

function makeBranchScope(branchNames = []) {
  const sanitizedBranches = Array.from(new Set((branchNames ?? [])
    .map(makeBranchPart)
    .filter(Boolean)))
    .sort((first, second) => first.localeCompare(second, "vi-VN"));
  if (sanitizedBranches.length === 1) return sanitizedBranches[0];
  if (sanitizedBranches.length > 1) return sanitizedBranches.join("_");
  return "Tong_hop";
}

export function makeOutputFileName(branchName, { rowResults = [], now = new Date() } = {}) {
  const monthKey = getLatestMonthKey(rowResults, now);
  return `${monthKey}-${makeBranchPart(branchName)}.xlsx`;
}

export function makeMergedOutputFileName(
  filters = {},
  { rowResults = [], branchNames = [], now = new Date() } = {},
) {
  const monthKey = getLatestMonthKey(rowResults, now);
  const filterBranches = filters.branches?.length ? filters.branches : [];
  const scope = makeBranchScope(branchNames.length ? branchNames : filterBranches);
  return `${monthKey}-${scope}.xlsx`;
}

export { OUTPUT_FILE_NAME };
