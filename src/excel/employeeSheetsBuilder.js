/**
 * Tạo các sheet chấm công riêng theo từng nhân viên trong file Excel xuất ra.
 * Sheet nhân viên chỉ dùng dữ liệu đã xử lý và ghi chú gốc từ Diary.
 */
import { normalizeEmployeeCode, normalizeLookup, normalizeText } from "../employees/employeeModel.js";
import { isVpEmployee } from "../services/attendance/vpRuleService.js";
import { timeValueToMinutes } from "../utils/timeUtils.js";
import { writeCalculatedCell } from "./excelWriter.js";

export const EMPLOYEE_ATTENDANCE_HEADERS = Object.freeze([
  "Ngày",
  "Thứ",
  "Vào 1",
  "Ra 1",
  "Vào 2",
  "Ra 2",
  "Đi sớm",
  "Đi trễ",
  "Về sớm",
  "Tăng ca",
  "Trừ khác",
  "Ngày Công",
  "Ghi chú",
]);

const INVALID_SHEET_NAME_CHARS = /[\\/?*:\[\]]/g;
const TITLE_FILL = "D9EAD3";
const HEADER_FILL = "E2F0D9";
const SUMMARY_FILL = "FFF2CC";

function hasClockValue(clockValues = {}) {
  return Object.values(clockValues ?? {}).some((value) =>
    value !== null && value !== undefined && String(value).trim() !== "",
  );
}

function getMonthKeyFromDayKey(dayKey) {
  const match = String(dayKey ?? "").match(/^(\d{4}-\d{2})-\d{2}$/);
  return match ? match[1] : "";
}

function getReportMonthKey(rowResults = []) {
  const monthKeys = rowResults
    .map((rowResult) => getMonthKeyFromDayKey(rowResult.dayKey))
    .filter(Boolean);
  if (!monthKeys.length) return "";
  return monthKeys.sort().at(-1);
}

function isInReportMonth(rowResult, reportMonthKey = "") {
  if (!reportMonthKey) return true;
  return getMonthKeyFromDayKey(rowResult.dayKey) === reportMonthKey;
}

function formatMonthTitle(monthKey) {
  const match = String(monthKey ?? "").match(/^(\d{4})-(\d{2})$/);
  return match ? `${match[2]}/${match[1]}` : "";
}

function formatDayKey(dayKey, fallback = "") {
  const match = String(dayKey ?? "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : fallback;
}

function getEmployeeKey(rowResult = {}) {
  return normalizeEmployeeCode(rowResult.employeeCode) ||
    normalizeLookup(rowResult.employeeName) ||
    normalizeLookup(rowResult.effectiveEmployeeName);
}

function getEmployeeName(rowResult = {}) {
  return normalizeText(rowResult.employeeName || rowResult.effectiveEmployeeName) || "Nhân viên";
}

function getSummaryKey(summary = {}) {
  return normalizeEmployeeCode(summary.employeeCode) || normalizeLookup(summary.employeeName);
}

function buildSummaryMap(employeeSummaries = []) {
  const map = new Map();
  (employeeSummaries ?? []).forEach((summary) => {
    const key = getSummaryKey(summary);
    if (key) map.set(key, summary);
  });
  return map;
}

function getSummaryForEmployee(summaryMap, group = {}) {
  return summaryMap.get(group.key) ||
    summaryMap.get(normalizeEmployeeCode(group.employeeCode)) ||
    summaryMap.get(normalizeLookup(group.employeeName));
}

function sanitizeSheetName(name) {
  const cleaned = normalizeText(name)
    .replace(INVALID_SHEET_NAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 31);
  return cleaned || "Nhan vien";
}

function makeUniqueSheetName(workbook, rawName) {
  const used = new Set(workbook.SheetNames.map((name) => name.toLowerCase()));
  const base = sanitizeSheetName(rawName).slice(0, 31);
  let candidate = base;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${index}`;
    candidate = `${base.slice(0, 31 - suffix.length)}${suffix}`;
    index += 1;
  }
  return candidate;
}

function getEffectiveClockValue(rowResult, slot) {
  const shopValue = rowResult.shopClockValues?.[slot];
  if (shopValue !== null && shopValue !== undefined && String(shopValue).trim() !== "") {
    return shopValue;
  }
  return rowResult.adjustedClockValues?.[slot] ?? rowResult.clockValues?.[slot] ?? "";
}

function isWorkedDay(rowResult) {
  if (rowResult.isOff) return false;
  if (Number(rowResult.calculation?.totalWorkedMinutes) > 0) return true;
  return hasClockValue(rowResult.clockValues) ||
    hasClockValue(rowResult.shopClockValues) ||
    hasClockValue(rowResult.adjustedClockValues) ||
    hasClockValue(rowResult.originalClockValues);
}

function getWorkedDayKey(rowResult) {
  return rowResult.dayKey || String(rowResult.row ?? "");
}

function getDisplayWorkDay(rowResult, reportMonthKey = "") {
  if (!isInReportMonth(rowResult, reportMonthKey)) return 0;
  return isWorkedDay(rowResult) ? 1 : 0;
}

function sortEmployeeRows(rows = []) {
  return [...rows].sort((left, right) => {
    const leftDay = String(left.dayKey ?? "");
    const rightDay = String(right.dayKey ?? "");
    if (leftDay && rightDay && leftDay !== rightDay) return leftDay.localeCompare(rightDay);
    return Number(left.row ?? 0) - Number(right.row ?? 0);
  });
}

function makeEmployeeGroups(rowResults = []) {
  const groups = new Map();
  rowResults.forEach((rowResult) => {
    const key = getEmployeeKey(rowResult);
    if (!key) return;
    const current = groups.get(key) ?? {
      key,
      employeeCode: normalizeEmployeeCode(rowResult.employeeCode),
      employeeName: getEmployeeName(rowResult),
      rows: [],
    };
    current.rows.push(rowResult);
    groups.set(key, current);
  });
  return Array.from(groups.values()).map((group) => ({
    ...group,
    rows: sortEmployeeRows(group.rows),
  }));
}

function applyCellStyle(cell, style) {
  if (!cell) return;
  cell.s = { ...(cell.s ?? {}), ...style };
}

function writeTextCell(sheet, XLSX, row, column, value, style) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  sheet[address] = { t: "s", v: String(value ?? "") };
  applyCellStyle(sheet[address], style);
}

function writeClockCell(sheet, XLSX, row, column, value) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  const minutes = timeValueToMinutes(value);
  if (minutes === null) {
    writeCalculatedCell(sheet, address, normalizeText(value));
    return;
  }
  writeCalculatedCell(sheet, address, minutes / (24 * 60), "hh:mm");
}

function writeNumberCell(sheet, XLSX, row, column, value) {
  const address = XLSX.utils.encode_cell({ r: row, c: column });
  writeCalculatedCell(sheet, address, Number(value) || 0, "0");
}

function buildEmployeeSheetSummary(
  rows = [],
  { employeeName = "", reportMonthKey = "", sourceSummary = null } = {},
) {
  // Ưu tiên dùng đúng số liệu đã ghi ở Summary box của sheet Chi tiết/Tổng hợp.
  // Như vậy các cột tổng trong sheet nhân viên luôn khớp 1:1 với Summary box.
  if (sourceSummary) {
    return {
      earlyInMinutes: Number(sourceSummary.earlyInMinutes) || 0,
      lateMinutes: Number(sourceSummary.lateMinutes) || 0,
      earlyMinutes: Number(sourceSummary.earlyMinutes) || 0,
      overtimeMinutes: isVpEmployee(employeeName) ? 0 : Number(sourceSummary.overtimeMinutes) || 0,
      otherDeductionMinutes: Number(sourceSummary.otherDeductionMinutes) || 0,
      workDayCount: Number(sourceSummary.workDayCount) || 0,
      workedDayKeys: new Set(sourceSummary.workedDayKeys ?? []),
    };
  }

  const summary = {
    earlyInMinutes: 0,
    lateMinutes: 0,
    earlyMinutes: 0,
    overtimeMinutes: 0,
    otherDeductionMinutes: 0,
    workDayCount: 0,
    workedDayKeys: new Set(),
  };

  rows.forEach((rowResult) => {
    // Fallback khi không truyền Summary box: vẫn chỉ tính tháng báo cáo.
    if (!isInReportMonth(rowResult, reportMonthKey)) return;
    const calculation = rowResult.calculation ?? {};
    summary.earlyInMinutes += Number(calculation.validEarlyInMinutes) || 0;
    summary.lateMinutes += Number(calculation.totalLateMinutes) || 0;
    summary.earlyMinutes += Number(calculation.validEarlyMinutes) || 0;
    if (!isVpEmployee(employeeName)) {
      summary.overtimeMinutes += Number(calculation.validOvertimeMinutes) || 0;
    }
    summary.otherDeductionMinutes += Number(calculation.otherDeductionMinutes) || 0;
    if (isWorkedDay(rowResult)) {
      summary.workedDayKeys.add(getWorkedDayKey(rowResult));
      summary.workDayCount = summary.workedDayKeys.size;
    }
  });

  return summary;
}


function writeEmployeeSheetRows({ XLSX, sheet, rows, reportMonthKey }) {
  rows.forEach((rowResult, index) => {
    const row = index + 3;
    const calculation = rowResult.calculation ?? {};
    const values = [
      formatDayKey(rowResult.dayKey, rowResult.dateValue),
      rowResult.weekdayText ?? "",
      getEffectiveClockValue(rowResult, "in1"),
      getEffectiveClockValue(rowResult, "out1"),
      getEffectiveClockValue(rowResult, "in2"),
      getEffectiveClockValue(rowResult, "out2"),
      Number(calculation.earlyInMinutes) || 0,
      Number(calculation.lateMinutes) || 0,
      Number(calculation.earlyMinutes) || 0,
      Number(calculation.overtimeMinutes) || 0,
      Number(calculation.otherDeductionMinutes) || 0,
      getDisplayWorkDay(rowResult, reportMonthKey),
      rowResult.diaryNote ?? "",
    ];

    values.forEach((value, column) => {
      if (column >= 2 && column <= 5) {
        writeClockCell(sheet, XLSX, row, column, value);
      } else if (column >= 6 && column <= 11) {
        writeNumberCell(sheet, XLSX, row, column, value);
      } else {
        writeTextCell(sheet, XLSX, row, column, value, {
          alignment: { vertical: "center", wrapText: true },
        });
      }
    });
  });
}

function writeEmployeeSummaryRow({ XLSX, sheet, row, summary }) {
  const summaryValues = [
    "Tổng",
    "",
    "",
    "",
    "",
    "",
    Number(summary.earlyInMinutes) || 0,
    Number(summary.lateMinutes) || 0,
    Number(summary.earlyMinutes) || 0,
    Number(summary.overtimeMinutes) || 0,
    Number(summary.otherDeductionMinutes) || 0,
    Number(summary.workDayCount) || 0,
    "",
  ];
  const summaryStyle = {
    fill: { patternType: "solid", fgColor: { rgb: SUMMARY_FILL } },
    font: { bold: true },
    alignment: { horizontal: "center", vertical: "center", wrapText: true },
    border: {
      top: { style: "thin", color: { rgb: "B7B7B7" } },
      bottom: { style: "thin", color: { rgb: "B7B7B7" } },
      left: { style: "thin", color: { rgb: "B7B7B7" } },
      right: { style: "thin", color: { rgb: "B7B7B7" } },
    },
  };

  summaryValues.forEach((value, column) => {
    if (column >= 6 && column <= 11) {
      writeNumberCell(sheet, XLSX, row, column, value);
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      applyCellStyle(sheet[address], summaryStyle);
      return;
    }
    writeTextCell(sheet, XLSX, row, column, value, summaryStyle);
  });
}

function createEmployeeSheet(XLSX, { employeeName, monthLabel, reportMonthKey, rows, sourceSummary }) {
  const sheet = {};
  const lastColumn = EMPLOYEE_ATTENDANCE_HEADERS.length - 1;

  writeTextCell(sheet, XLSX, 0, 0, `BẢNG CHẤM CÔNG THÁNG ${monthLabel}`, {
    fill: { patternType: "solid", fgColor: { rgb: TITLE_FILL } },
    font: { bold: true, sz: 14 },
    alignment: { horizontal: "center", vertical: "center" },
  });
  writeTextCell(sheet, XLSX, 1, 0, `Nhân viên: ${employeeName}`, {
    font: { bold: true },
    alignment: { horizontal: "left", vertical: "center" },
  });
  sheet["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: lastColumn } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: lastColumn } },
  ];

  EMPLOYEE_ATTENDANCE_HEADERS.forEach((header, column) => {
    writeTextCell(sheet, XLSX, 2, column, header, {
      fill: { patternType: "solid", fgColor: { rgb: HEADER_FILL } },
      font: { bold: true },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "B7B7B7" } },
        bottom: { style: "thin", color: { rgb: "B7B7B7" } },
        left: { style: "thin", color: { rgb: "B7B7B7" } },
        right: { style: "thin", color: { rgb: "B7B7B7" } },
      },
    });
  });

  writeEmployeeSheetRows({ XLSX, sheet, rows, reportMonthKey });
  const summary = buildEmployeeSheetSummary(rows, { employeeName, reportMonthKey, sourceSummary });
  const dataEndRow = Math.max(2, rows.length + 2);
  const summaryRow = dataEndRow + 1;
  writeEmployeeSummaryRow({ XLSX, sheet, row: summaryRow, summary });

  sheet["!cols"] = [
    { wch: 12 },
    { wch: 8 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 10 },
    { wch: 11 },
    { wch: 42 },
  ];
  sheet["!rows"] = [
    { hpt: 24 },
    { hpt: 22 },
    { hpt: 22 },
    ...Array.from({ length: rows.length }, () => undefined),
    { hpt: 22 },
  ];
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 2, c: 0 },
      e: { r: dataEndRow, c: lastColumn },
    }),
  };
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: summaryRow, c: lastColumn },
  });
  return sheet;
}

/** Append các sheet từng nhân viên vào workbook đang xuất. */
export function appendEmployeeAttendanceSheets(XLSX, workbook, rowResults = [], employeeSummaries = []) {
  const reportMonthKey = getReportMonthKey(rowResults);
  const monthLabel = formatMonthTitle(reportMonthKey);
  if (!monthLabel) return;

  const summaryMap = buildSummaryMap(employeeSummaries);
  makeEmployeeGroups(rowResults).forEach((group) => {
    const sheet = createEmployeeSheet(XLSX, {
      employeeName: group.employeeName,
      monthLabel,
      reportMonthKey,
      rows: group.rows,
      sourceSummary: getSummaryForEmployee(summaryMap, group),
    });
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      makeUniqueSheetName(workbook, group.employeeName),
    );
  });
}
