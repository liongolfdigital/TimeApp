/**
 * Xử lý đúng một dòng nguồn: match employee, normalize clock, chọn ca, tính công,
 * đối chiếu Diary và tạo metadata audit. Việc hoàn thiện sheet/style nằm ở builder.
 */
import { detectBranchFromText, normalizeBranch } from "../branches/branchModel.js";
import { KEPT_COLUMNS } from "../constants/excelConstants.js";
import {
  getEmployeeGroup,
  normalizeEmployeeCode,
  normalizeLookup,
  normalizeText,
} from "../employees/employeeModel.js";
import {
  createRuleContext,
  evaluateShiftRules,
} from "../rules/shiftRuleEngine.js";
import {
  ABNORMAL_ATTENDANCE_NOTE,
  getAbnormalAttendance,
} from "../services/attendance/abnormalAttendanceService.js";
import { createDiaryLookup } from "../services/attendance/diaryReasonService.js";
import {
  getVPSaturdayShiftAssignment,
  isVpEmployee,
} from "../services/attendance/vpRuleService.js";
import {
  getAttendanceEmployeeKey,
  getWeekKey,
  isOffAttendanceDay,
} from "./attendanceHighlights.js";
import { calculateTimekeeping } from "./attendanceCalculator.js";
import { adjustClockColumns } from "./clockClassifier.js";
import {
  appendNote,
  applyDiaryViolations,
} from "./diaryViolationResolver.js";
import { findRegisteredEmployee } from "./employeeLookup.js";
import { getSourceCell as getMappedSourceCell } from "./excelColumnMapper.js";
import { cloneCell, writeCalculatedCell } from "./excelWriter.js";
import {
  matchesProcessFilters,
  resolveEmployeeBranch,
} from "./processFilters.js";
import { normalizeDiaryDate } from "../diary/diaryModel.js";

function getSourceCell(XLSX, sourceSheet, columnMap, row, header) {
  return getMappedSourceCell(XLSX, sourceSheet, columnMap, row, header);
}

function getCellDisplayValue(XLSX, cell) {
  return cell ? XLSX.utils.format_cell(cell) : "";
}

// Tạo khóa nhân viên-tháng dùng cộng phút trễ và cảnh báo riêng cho VP.
function getEmployeeMonthKey(XLSX, dateValue, employeeCode, employeeName) {
  let year;
  let month;

  if (dateValue instanceof Date && !Number.isNaN(dateValue.getTime())) {
    year = dateValue.getUTCFullYear();
    month = dateValue.getUTCMonth() + 1;
  } else if (typeof dateValue === "number") {
    const parsedDate = XLSX.SSF.parse_date_code(dateValue);
    year = parsedDate?.y;
    month = parsedDate?.m;
  } else {
    const dateText = String(dateValue ?? "").trim();
    const dateMatch = dateText.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})$/);
    if (dateMatch) {
      year = Number(dateMatch[3]);
      month = Number(dateMatch[2]);
    }
  }

  if (!year || !month) return null;
  const identity = normalizeLookup(employeeCode) || normalizeLookup(employeeName);
  if (!identity) return null;
  return `${identity}|${year}-${String(month).padStart(2, "0")}`;
}

// Ghi lại bốn cell clock sau normalize bằng cách clone đúng cell nguồn/style gốc.
function writeAdjustedClockCells({
  XLSX,
  targetSheet,
  sourceSheet,
  columnMap,
  sourceRow,
  targetRow,
  outputStartColumn,
  adjustment,
}) {
  const slotHeaders = {
    in1: "Vào 1",
    out1: "Ra 1",
    in2: "Vào 2",
    out2: "Ra 2",
  };

  Object.entries(slotHeaders).forEach(([slot, targetHeader]) => {
    const targetColumn = outputStartColumn + KEPT_COLUMNS.indexOf(targetHeader);
    const targetAddress = XLSX.utils.encode_cell({ r: targetRow, c: targetColumn });
    const sourceSlot = adjustment.sourceSlots[slot];
    delete targetSheet[targetAddress];

    if (!sourceSlot || adjustment.adjusted[slot] === null || adjustment.adjusted[slot] === "") {
      return;
    }

    const sourceHeader = slotHeaders[sourceSlot];
    const sourceCell = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, sourceHeader);
    if (sourceCell) targetSheet[targetAddress] = cloneCell(sourceCell);
  });
}

/**
 * Xử lý một source row và trả rowResult; blank/filter được báo qua cờ riêng.
 * Các collection audit được truyền vào để giữ nguyên thứ tự và contract metadata cũ.
 */
export function processAttendanceSourceRow({
  XLSX,
  adjustmentLogs,
  appliedShiftRules,
  columnMap,
  determinedShifts,
  diaryLookup,
  diaryMatchLogs,
  employeeLookup,
  outputStartColumn,
  processFilters,
  shiftRules,
  sourceFileName,
  sourceRow,
  sourceSheet,
  targetRow,
  targetSheet,
  vpMonthlyLateMinutes,
}) {
  const codeCell = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Mã N.Viên");
  const employeeCode = getCellDisplayValue(XLSX, codeCell);
  const nameCell = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Tên N.Viên");
  const employeeName = nameCell?.v ?? "";

  if (!normalizeText(employeeCode) && !normalizeText(employeeName)) {
    return { skipped: true };
  }

  const registeredEmployee = findRegisteredEmployee(
    employeeLookup,
    employeeCode,
    employeeName,
  );
  const dateValue = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Ngày")?.v;
  if (
    processFilters?.onlyMatchingRows &&
    !matchesProcessFilters(
      { registeredEmployee, employeeCode, employeeName, dateValue, sourceFileName },
      processFilters,
    )
  ) {
    return { filteredOut: true };
  }
  const row = targetRow;

  KEPT_COLUMNS.forEach((header, outputIndex) => {
    const targetAddress = XLSX.utils.encode_cell({
      r: row,
      c: outputStartColumn + outputIndex,
    });
    if (header === "Giờ ĐK") return;
    const sourceCell = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, header);
    if (sourceCell) targetSheet[targetAddress] = cloneCell(sourceCell);
  });

  const weekdayCell = getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Thứ");
  const registeredShiftColumn = outputStartColumn + KEPT_COLUMNS.indexOf("Giờ ĐK");
  const registeredShiftAddress = XLSX.utils.encode_cell({
    r: row,
    c: registeredShiftColumn,
  });
  writeCalculatedCell(
    targetSheet,
    registeredShiftAddress,
    registeredEmployee?.registeredShift ?? "",
  );

  const originalClockValues = {
    in1: getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Vào 1")?.v,
    out1: getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Ra 1")?.v,
    in2: getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Vào 2")?.v,
    out2: getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Ra 2")?.v,
  };
  const abnormalAttendance = getAbnormalAttendance(originalClockValues);
  const effectiveEmployeeName = normalizeText(employeeName || registeredEmployee?.employeeName);
  const employeeGroup = getEmployeeGroup(effectiveEmployeeName);
  const branchCode = resolveEmployeeBranch({ registeredEmployee, employeeName, sourceFileName });
  const ruleShiftAssignment = evaluateShiftRules(
    createRuleContext({
      employeeCode,
      weekday: getCellDisplayValue(XLSX, weekdayCell),
      employee: registeredEmployee,
    }),
    shiftRules,
  );
  const vpSaturdayShiftAssignment = getVPSaturdayShiftAssignment({
    employeeName,
    attendanceDate: dateValue,
    clockValues: originalClockValues,
  });
  const shiftAssignment = vpSaturdayShiftAssignment ?? ruleShiftAssignment;
  const clockAdjustment = registeredEmployee
    ? adjustClockColumns(
        registeredEmployee,
        originalClockValues,
        shiftAssignment,
      )
    : {
        original: originalClockValues,
        adjusted: originalClockValues,
        sourceSlots: { in1: "in1", out1: "out1", in2: "in2", out2: "out2" },
        notes: [],
        changed: false,
        hasLog: false,
      };
  writeAdjustedClockCells({
    XLSX,
    targetSheet,
    sourceSheet,
    columnMap,
    sourceRow,
    targetRow: row,
    outputStartColumn,
    adjustment: clockAdjustment,
  });

  const sourceNote = getCellDisplayValue(
    XLSX,
    getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Ghi chú"),
  );
  const calculation = calculateTimekeeping({
    employee: registeredEmployee,
    employeeName,
    clockValues: clockAdjustment.adjusted,
    fallbackTotal: getSourceCell(XLSX, sourceSheet, columnMap, sourceRow, "Tổng giờ")?.v,
    additionalNotes: [...clockAdjustment.notes, sourceNote].filter(Boolean),
    shiftAssignment,
    attendanceDate: dateValue,
  });
  if (abnormalAttendance.abnormal) {
    calculation.note = appendNote(calculation.note, ABNORMAL_ATTENDANCE_NOTE);
  }

  const { diaryMatched, diaryExempted } = applyDiaryViolations({
    calculation,
    dateValue,
    diaryLookup,
    diaryMatchLogs,
    effectiveEmployeeName,
    employeeCode,
    employeeGroup,
    employeeName,
    row,
  });

  const employeeKey = getAttendanceEmployeeKey(employeeCode, employeeName);
  const dayKey = normalizeDiaryDate(dateValue);
  const isOff = Boolean(employeeKey) && Boolean(dayKey) &&
    isOffAttendanceDay(
      calculation.note,
      clockAdjustment.adjusted,
      calculation.totalWorkedMinutes,
    );

  determinedShifts.push({
    rowNumber: row + 1,
    employeeCode,
    employeeName: nameCell?.v ?? "",
    shift: calculation.determinedShift,
    shiftKey: calculation.determinedShiftKey ?? null,
    source: calculation.shiftSource ?? null,
    ruleId: calculation.appliedRuleId ?? null,
    ruleName: calculation.appliedRuleName ?? null,
    branch: branchCode,
    employeeGroup,
    standardOutMinutes: calculation.standardOutMinutes ?? null,
    standardOutTime: calculation.standardOutTime ?? null,
    overtimeStandardOutMinutes: calculation.overtimeStandardOutMinutes ?? null,
    overtimeStandardOutTime: calculation.overtimeStandardOutTime ?? null,
    expectedEndByRegisteredHoursMinutes:
      calculation.expectedEndByRegisteredHoursMinutes ?? null,
    expectedEndByRegisteredHoursTime:
      calculation.expectedEndByRegisteredHoursTime ?? null,
    overtimeActualOutMinutes: calculation.overtimeActualOutMinutes ?? null,
    overtimeActualOutTime: calculation.overtimeActualOutTime ?? null,
    isFullDayByMorningToAfternoon: Boolean(calculation.isFullDayByMorningToAfternoon),
    actualOutMinutes: calculation.actualOutMinutes ?? null,
    actualOutTime: calculation.actualOutTime ?? null,
    actualOutSource: calculation.actualOutSource ?? null,
    totalWorkedMinutes: calculation.totalWorkedMinutes ?? null,
  });
  if (shiftAssignment) {
    appliedShiftRules.push({
      rowNumber: row + 1,
      employeeCode,
      employeeName,
      weekday: getCellDisplayValue(XLSX, weekdayCell),
      shift: shiftAssignment.shift.name,
      ruleId: shiftAssignment.ruleId,
      ruleName: shiftAssignment.ruleName,
    });
  }
  if (clockAdjustment.hasLog) {
    adjustmentLogs.push({
      rowNumber: row + 1,
      employeeCode,
      employeeName,
      originalClockValues: clockAdjustment.original,
      adjustedClockValues: clockAdjustment.adjusted,
      notes: clockAdjustment.notes,
      changed: clockAdjustment.changed,
    });
  }

  const monthKey = isVpEmployee(employeeName)
    ? getEmployeeMonthKey(XLSX, dateValue, employeeCode, employeeName)
    : null;
  if (monthKey && calculation.totalLateMinutes !== null) {
    const currentSummary = vpMonthlyLateMinutes.get(monthKey) ?? {
      employeeCode,
      employeeName,
      month: monthKey.slice(monthKey.lastIndexOf("|") + 1),
      totalLateMinutes: 0,
    };
    currentSummary.totalLateMinutes += calculation.totalLateMinutes;
    vpMonthlyLateMinutes.set(monthKey, currentSummary);
  }

  return {
    matched: calculation.matched,
    rowResult: {
      row,
      sourceRow,
      calculation,
      monthKey,
      isOff,
      employeeKey,
      employeeCode,
      employeeName,
      branch: branchCode,
      effectiveEmployeeName,
      dateValue,
      dayKey,
      weekKey: getWeekKey(dateValue),
      clockValues: originalClockValues,
      multiplePunches: abnormalAttendance.abnormal
        ? { slots: abnormalAttendance.slots }
        : null,
      diaryMatched,
      diaryExempted,
    },
  };
}

/** Factory nhỏ để builder không cần biết nguồn tạo lookup Diary. */
export function makeDiaryLookup(entries) {
  return createDiaryLookup(entries);
}
