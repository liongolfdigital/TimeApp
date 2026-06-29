import { detectBranchFromText, normalizeBranch } from "../branches/branchModel.js";
import {
  normalizeEmployeeCode,
  normalizeLookup,
} from "../employees/employeeModel.js";
import { normalizeDiaryDate } from "../diary/diaryModel.js";

function makeEmployeeSelectionSets(filters = {}) {
  const selectedCodes = new Set();
  const selectedKeys = new Set();
  (filters.employeeIds ?? []).forEach((value) => {
    const code = normalizeEmployeeCode(value);
    const key = normalizeLookup(value);
    if (code) selectedCodes.add(code);
    if (key) selectedKeys.add(key);
  });
  return {
    selectedCodes,
    selectedKeys,
    hasSelection: Boolean(selectedCodes.size || selectedKeys.size),
  };
}

function matchesSelectedEmployee(
  { registeredEmployee, employeeCode, employeeName },
  { selectedCodes, selectedKeys },
) {
  const rowCodes = [registeredEmployee?.employeeCode, employeeCode]
    .map(normalizeEmployeeCode)
    .filter(Boolean);
  if (rowCodes.some((code) => selectedCodes.has(code))) return true;
  return [
    registeredEmployee?.id,
    registeredEmployee?.employeeCode,
    registeredEmployee?.employeeName,
    employeeCode,
    employeeName,
  ].map(normalizeLookup).filter(Boolean).some((key) => selectedKeys.has(key));
}

export function resolveEmployeeBranch({
  registeredEmployee,
  employeeName,
  sourceFileName = "",
}) {
  return normalizeBranch(registeredEmployee?.branch)
    || detectBranchFromText(registeredEmployee?.employeeName)
    || detectBranchFromText(employeeName)
    || detectBranchFromText(sourceFileName);
}

export function matchesProcessFilters(
  { registeredEmployee, employeeCode, employeeName, dateValue, sourceFileName = "" },
  filters = {},
) {
  const branches = new Set((filters.branches ?? []).map(normalizeBranch).filter(Boolean));
  const employeeSelection = makeEmployeeSelectionSets(filters);
  const employeeBranch = resolveEmployeeBranch({
    registeredEmployee,
    employeeName,
    sourceFileName,
  });
  const dayKey = normalizeDiaryDate(dateValue);
  if (filters.dateFrom && (!dayKey || dayKey < filters.dateFrom)) return false;
  if (filters.dateTo && (!dayKey || dayKey > filters.dateTo)) return false;
  if (employeeSelection.hasSelection) {
    return matchesSelectedEmployee(
      { registeredEmployee, employeeCode, employeeName },
      employeeSelection,
    );
  }
  return !(branches.size && !branches.has(employeeBranch));
}
