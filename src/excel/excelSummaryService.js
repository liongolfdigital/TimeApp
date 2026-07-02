/**
 * Cộng các tổng theo nhân viên và ghi hộp tổng hợp cạnh bảng chấm công.
 * Chỉ các field valid* từ processor được cộng; riêng Đi trễ dùng toàn bộ phút thực tế.
 */
import {
  MONTHLY_LATE_WARNING_MINUTES,
  MONTHLY_LATE_WARNING_TEXT,
} from "../constants/attendanceConstants.js";
import { OUTPUT_COLUMNS } from "../constants/excelConstants.js";
import { isVpEmployee } from "../services/attendance/vpRuleService.js";
import { writeCalculatedCell } from "./excelWriter.js";

function hasClockValue(clockValues = {}) {
  return Object.values(clockValues ?? {}).some((value) =>
    value !== null && value !== undefined && String(value).trim() !== "",
  );
}

function getWorkedDayKey(rowResult) {
  return rowResult.dayKey || String(rowResult.row);
}

function getMonthKeyFromDayKey(dayKey) {
  const match = String(dayKey ?? "").match(/^(\d{4}-\d{2})-\d{2}$/);
  return match ? match[1] : "";
}

function getSummaryMonthKey(rowResults = []) {
  const monthKeys = rowResults
    .map((rowResult) => getMonthKeyFromDayKey(rowResult.dayKey))
    .filter(Boolean);
  if (!monthKeys.length) return "";
  // File máy chấm công thường kéo theo vài ngày cuối tháng trước.
  // Lấy tháng mới nhất trong dữ liệu làm tháng báo cáo hiện tại để Tổng công không cộng ngày tháng cũ.
  return monthKeys.sort().at(-1);
}

function isInSummaryMonth(rowResult, summaryMonthKey) {
  if (!summaryMonthKey) return true;
  return getMonthKeyFromDayKey(rowResult.dayKey) === summaryMonthKey;
}

function isWorkedDay(rowResult, summaryMonthKey = "") {
  if (!isInSummaryMonth(rowResult, summaryMonthKey)) return false;
  if (rowResult.isOff) return false;
  if (Number(rowResult.calculation?.totalWorkedMinutes) > 0) return true;
  return hasClockValue(rowResult.clockValues) ||
    hasClockValue(rowResult.shopClockValues) ||
    hasClockValue(rowResult.originalClockValues);
}

function normalizeWeekdayText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function isSaturday(rowResult = {}) {
  const match = String(rowResult.dayKey ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day))).getUTCDay() === 6;
  }
  const weekday = normalizeWeekdayText(rowResult.weekdayText);
  return weekday.includes("thu 7") || weekday.includes("saturday");
}

function getWorkedDayCredit(rowResult, summaryMonthKey = "", employeeName = "") {
  if (!isWorkedDay(rowResult, summaryMonthKey)) return 0;
  return isVpEmployee(employeeName) && isSaturday(rowResult) ? 0.5 : 1;
}

function sumWorkedDayCredits(workedDayCredits = new Map()) {
  return Array.from(workedDayCredits.values()).reduce((total, credit) => total + (Number(credit) || 0), 0);
}

/** Cộng số phút/tiền theo nhân viên; Tổng đi trễ dùng toàn bộ phút trễ thực tế. */
export function buildEmployeeSummaries(rowResults) {
  const summaries = new Map();
  const summaryMonthKey = getSummaryMonthKey(rowResults);
  rowResults.forEach((rowResult) => {
    const { row, calculation, employeeCode, employeeName } = rowResult;
    if (!employeeCode) return;
    const current = summaries.get(employeeCode) ?? {
      firstRow: row, employeeCode, employeeName,
      lateMinutes: 0, earlyInMinutes: 0, penalty: 0, earlyMinutes: 0, overtimeMinutes: 0,
      otherDeductionMinutes: 0, workDayCount: 0, workedDayKeys: new Set(), workedDayCredits: new Map(),
    };
    current.firstRow = Math.min(current.firstRow, row);
    const workedDayCredit = getWorkedDayCredit(rowResult, summaryMonthKey, employeeName);
    if (workedDayCredit > 0) {
      const workedDayKey = getWorkedDayKey(rowResult);
      current.workedDayKeys.add(workedDayKey);
      const previousCredit = Number(current.workedDayCredits.get(workedDayKey)) || 0;
      current.workedDayCredits.set(workedDayKey, Math.max(previousCredit, workedDayCredit));
      current.workDayCount = sumWorkedDayCredits(current.workedDayCredits);
    }
    // Đi trễ và Về sớm là tổng bắt buộc; Đi sớm luôn bằng 0, Tăng ca dùng giá trị qua rule Diary.
    current.lateMinutes += Number(calculation.totalLateMinutes) || 0;
    current.earlyInMinutes += Number(calculation.validEarlyInMinutes) || 0;
    current.penalty += Number(calculation.penalty) || 0;
    current.earlyMinutes += Number(calculation.validEarlyMinutes) || 0;
    if (!isVpEmployee(employeeName)) {
      current.overtimeMinutes += Number(calculation.validOvertimeMinutes) || 0;
    }
    current.otherDeductionMinutes += Number(calculation.otherDeductionMinutes) || 0;
    summaries.set(employeeCode, current);
  });
  return Array.from(summaries.values()).map((summary) => ({
    ...summary,
    workedDayKeys: Array.from(summary.workedDayKeys ?? []),
    workedDayCredits: Array.from(summary.workedDayCredits ?? [], ([dayKey, credit]) => ({
      dayKey,
      credit,
    })),
  }));
}

/** Ghi hộp tổng hợp cạnh bảng và cảnh báo tháng cho VP khi vượt ba giờ đi trễ. */
export function writeEmployeeSummaryBox(
  XLSX,
  targetSheet,
  outputStartColumn,
  summary,
  startColumn = outputStartColumn + OUTPUT_COLUMNS.indexOf("Nhân viên"),
) {
  const row = summary.firstRow;
  const values = [
    ["Nhân viên", summary.employeeName],
    ["Tổng công", summary.workDayCount ?? 0],
    ["Đi sớm", summary.earlyInMinutes],
    ["Đi trễ", summary.lateMinutes], ["Phạt", summary.penalty],
    ["Về sớm", summary.earlyMinutes], ["Tăng ca", summary.overtimeMinutes],
    ["Trừ khác", summary.otherDeductionMinutes ?? 0],
  ];
  values.forEach((items, rowOffset) => items.forEach((value, columnOffset) => {
    const address = XLSX.utils.encode_cell({ r: row + rowOffset, c: startColumn + columnOffset });
    const numberFormat = items[0] === "Phạt" && columnOffset === 1
      ? "#,##0"
      : items[0] === "Tổng công" && columnOffset === 1
        ? "0.##"
        : "0";
    writeCalculatedCell(targetSheet, address, value, numberFormat);
    if (columnOffset === 0) {
      targetSheet[address].s = {
        ...(targetSheet[address].s ?? {}),
        fill: { patternType: "solid", fgColor: { rgb: "D9EAD3" } },
        font: { ...(targetSheet[address].s?.font ?? {}), bold: true },
      };
    }
  }));

  const warningRow = row + values.length;
  const hasMonthlyLateWarning = isVpEmployee(summary.employeeName)
    && summary.lateMinutes > MONTHLY_LATE_WARNING_MINUTES;
  if (hasMonthlyLateWarning) {
    const address = XLSX.utils.encode_cell({ r: warningRow, c: startColumn });
    writeCalculatedCell(targetSheet, address, MONTHLY_LATE_WARNING_TEXT);
    targetSheet[address].s = {
      fill: { patternType: "solid", fgColor: { rgb: "FCE4D6" } },
      font: { bold: true, color: { rgb: "C00000" } },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
    };
    targetSheet[XLSX.utils.encode_cell({ r: warningRow, c: startColumn + 1 })] = {
      t: "s", v: "", s: structuredClone(targetSheet[address].s),
    };
    targetSheet["!merges"] = [...(targetSheet["!merges"] ?? []), {
      s: { r: warningRow, c: startColumn }, e: { r: warningRow, c: startColumn + 1 },
    }];
  }
  return hasMonthlyLateWarning ? warningRow : row + values.length - 1;
}
