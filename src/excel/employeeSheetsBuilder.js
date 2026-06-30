/**
 * Tạo các sheet chấm công riêng theo từng nhân viên trong file Excel xuất ra.
 * Sheet nhân viên chỉ dùng dữ liệu đã xử lý và ghi chú gốc từ Diary.
 */
import { normalizeEmployeeCode, normalizeLookup, normalizeText } from "../employees/employeeModel.js";
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

function makeEmployeeGroups(rowResults = [], reportMonthKey = "") {
  const groups = new Map();
  rowResults.forEach((rowResult) => {
    if (reportMonthKey && getMonthKeyFromDayKey(rowResult.dayKey) !== reportMonthKey) return;
    const key = getEmployeeKey(rowResult);
    if (!key) return;
    const current = groups.get(key) ?? {
      employeeName: getEmployeeName(rowResult),
      rows: [],
    };
    current.rows.push(rowResult);
    groups.set(key, current);
  });
  return Array.from(groups.values());
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

function writeEmployeeSheetRows({ XLSX, sheet, rows }) {
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
      isWorkedDay(rowResult) ? 1 : 0,
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

function createEmployeeSheet(XLSX, { employeeName, monthLabel, rows }) {
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

  writeEmployeeSheetRows({ XLSX, sheet, rows });

  const dataEndRow = Math.max(2, rows.length + 2);
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
  sheet["!rows"] = [{ hpt: 24 }, { hpt: 22 }, { hpt: 22 }];
  sheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 2, c: 0 },
      e: { r: dataEndRow, c: lastColumn },
    }),
  };
  sheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: dataEndRow, c: lastColumn },
  });
  return sheet;
}

/** Append các sheet từng nhân viên vào workbook đang xuất. */
export function appendEmployeeAttendanceSheets(XLSX, workbook, rowResults = []) {
  const reportMonthKey = getReportMonthKey(rowResults);
  const monthLabel = formatMonthTitle(reportMonthKey);
  if (!monthLabel) return;

  makeEmployeeGroups(rowResults, reportMonthKey).forEach((group) => {
    const sheet = createEmployeeSheet(XLSX, {
      employeeName: group.employeeName,
      monthLabel,
      rows: group.rows,
    });
    XLSX.utils.book_append_sheet(
      workbook,
      sheet,
      makeUniqueSheetName(workbook, group.employeeName),
    );
  });
}
