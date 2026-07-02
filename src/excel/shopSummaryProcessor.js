import { downloadExcelBlob } from "./excelWriter.js";
import { calculateLatePenalty } from "../services/attendance/lateEarlyService.js";
import { loadXlsxRuntime } from "./xlsxRuntime.js";

const SHOP_SUMMARY_HEADERS = Object.freeze([
  "Mã NV",
  "Tên CC",
  "Họ và tên",
  "Chi nhánh (file)",
  "Ngày công",
  "Tăng ca (phút)",
  "Đi trễ (phút)",
  "Về sớm (phút)",
  "Trừ khác (phút)",
  "Phút tăng/trừ",
  "Tiền phạt đi trễ (đ)",
]);

const FIELD_ALIASES = Object.freeze({
  employeeCode: ["ma nv", "ma n vien", "ma nhan vien", "ma nhan su"],
  employeeName: ["ten cc", "ten n vien", "ten nhan vien", "ten cham cong", "nhan vien"],
  fullName: ["ho va ten", "ho ten", "ten day du"],
  day: ["ngay"],
  workDays: ["ngay cong", "tong cong", "cong"],
  overtime: ["tang ca", "tang ca phut", "tong tang ca"],
  late: ["di tre", "di tre phut", "tong di tre"],
  early: ["ve som", "ve som phut", "tong ve som"],
  otherDeduction: ["tru khac", "tru khac phut", "tong tru khac"],
  penalty: [
    "phat",
    "tien phat",
    "tien phat di tre",
    "phan loai di tre",
    "phat di tre",
  ],
});

function normalizeHeader(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[đĐ]/g, "d")
    .toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeFileName(value) {
  return String(value ?? "")
    .normalize("NFC")
    .trim()
    .replace(/[\/:*?"<>|]/g, "")
    .replace(/\s+/g, "_");
}

function compactText(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function getTextCell(row, index) {
  if (index === undefined || index < 0) return "";
  return compactText(row?.[index]);
}

function shouldTreatSingleSeparatorAsThousands(parts) {
  return parts.length > 1 && parts.slice(1).every((part) => part.length === 3);
}

function normalizeNumberText(source) {
  const text = compactText(source);
  if (!text) return "";
  const hasThousandUnit = /(?:^|\d)(?:k|ng[aà]n|ngh[iì]n)\b/i.test(text);
  const negative = /^-/.test(text);
  let normalized = text.replace(/\s+/g, "").replace(/[^0-9,.-]/g, "");
  if (!normalized || normalized === "-" || normalized === "," || normalized === ".") return "";

  normalized = normalized.replace(/^-/, "");
  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  if (hasComma && hasDot) {
    const lastComma = normalized.lastIndexOf(",");
    const lastDot = normalized.lastIndexOf(".");
    const decimalSeparator = lastComma > lastDot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    const decimalDigits = normalized.length - Math.max(lastComma, lastDot) - 1;
    if (decimalDigits === 3) {
      normalized = normalized.replace(/[,.]/g, "");
    } else {
      normalized = normalized
        .replace(new RegExp(`\\${thousandsSeparator}`, "g"), "")
        .replace(decimalSeparator, ".");
    }
  } else if (hasComma || hasDot) {
    const separator = hasComma ? "," : ".";
    const parts = normalized.split(separator);
    if (shouldTreatSingleSeparatorAsThousands(parts)) {
      normalized = parts.join("");
    } else if (separator === ",") {
      normalized = normalized.replace(",", ".");
    }
  }

  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed)) return "";
  const signedValue = negative ? -parsed : parsed;
  return hasThousandUnit && Math.abs(signedValue) < 1000 ? signedValue * 1000 : signedValue;
}

function parseNumber(rawValue, textValue) {
  if (typeof rawValue === "number" && Number.isFinite(rawValue)) return rawValue;
  const normalized = normalizeNumberText(textValue || rawValue);
  return normalized === "" ? 0 : normalized;
}

function roundOne(value) {
  const numberValue = Number(value) || 0;
  return Math.round(numberValue * 10) / 10;
}

function roundMinutes(value) {
  const numberValue = Number(value) || 0;
  return Math.round(numberValue);
}

function findColumn(headers, aliases) {
  const normalizedHeaders = headers.map(normalizeHeader);
  const normalizedAliases = aliases.map(normalizeHeader).filter(Boolean);
  for (const alias of normalizedAliases) {
    const exactIndex = normalizedHeaders.findIndex((header) => header === alias);
    if (exactIndex >= 0) return exactIndex;
  }
  for (const alias of normalizedAliases) {
    const startsWithIndex = normalizedHeaders.findIndex((header) =>
      header === alias || header.startsWith(`${alias} `),
    );
    if (startsWithIndex >= 0) return startsWithIndex;
  }
  return -1;
}

function buildColumnMap(headerRow = []) {
  const map = Object.fromEntries(
    Object.entries(FIELD_ALIASES).map(([field, aliases]) => [field, findColumn(headerRow, aliases)]),
  );
  map.penaltyHeader = map.penalty >= 0 ? normalizeHeader(headerRow[map.penalty]) : "";
  const hasIdentity = map.employeeCode >= 0 && map.employeeName >= 0;
  const hasMetrics = [
    map.workDays,
    map.overtime,
    map.late,
    map.early,
    map.otherDeduction,
    map.penalty,
  ].some((index) => index >= 0);
  return hasIdentity && hasMetrics ? map : null;
}

function findHeaderRow(textRows = []) {
  const limit = Math.min(textRows.length, 25);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const columnMap = buildColumnMap(textRows[rowIndex]);
    if (columnMap) return { rowIndex, columnMap };
  }
  return null;
}


function buildEmployeeSheetColumnMap(headerRow = []) {
  const map = {
    workDays: findColumn(headerRow, FIELD_ALIASES.workDays),
    overtime: findColumn(headerRow, FIELD_ALIASES.overtime),
    late: findColumn(headerRow, FIELD_ALIASES.late),
    early: findColumn(headerRow, FIELD_ALIASES.early),
    otherDeduction: findColumn(headerRow, FIELD_ALIASES.otherDeduction),
    penalty: findColumn(headerRow, FIELD_ALIASES.penalty),
  };
  const hasEmployeeSheetShape = findColumn(headerRow, ["ngay"]) >= 0 &&
    [map.workDays, map.overtime, map.late, map.early, map.otherDeduction, map.penalty]
      .filter((index) => index >= 0).length >= 3;
  return hasEmployeeSheetShape ? map : null;
}

function findEmployeeSheetHeaderRow(textRows = []) {
  const limit = Math.min(textRows.length, 30);
  for (let rowIndex = 0; rowIndex < limit; rowIndex += 1) {
    const columnMap = buildEmployeeSheetColumnMap(textRows[rowIndex]);
    if (columnMap) return { rowIndex, columnMap };
  }
  return null;
}

function extractEmployeeSheetName(textRows = [], sheetName = "") {
  for (const row of textRows.slice(0, 8)) {
    for (const cell of row ?? []) {
      const text = compactText(cell);
      const match = text.match(/^nh[aâ]n\s*vi[eê]n\s*:\s*(.+)$/i);
      if (match?.[1]) return compactText(match[1]);
    }
  }
  return compactText(sheetName);
}

function findEmployeeSheetSummaryRow(textRows = [], headerRowIndex = 0) {
  for (let rowIndex = headerRowIndex + 1; rowIndex < textRows.length; rowIndex += 1) {
    const firstCell = normalizeHeader(textRows[rowIndex]?.[0]);
    if (firstCell === "tong" || firstCell === "tong cong") return rowIndex;
  }
  return -1;
}

function parseEmployeeSheetSummary({ sheetName, textRows, rawRows }) {
  const headerInfo = findEmployeeSheetHeaderRow(textRows);
  if (!headerInfo) return null;
  const summaryRowIndex = findEmployeeSheetSummaryRow(textRows, headerInfo.rowIndex);
  if (summaryRowIndex < 0) return null;

  const employeeName = extractEmployeeSheetName(textRows, sheetName);
  if (!employeeName) return null;

  const rawRow = rawRows[summaryRowIndex] ?? [];
  const textRow = textRows[summaryRowIndex] ?? [];
  const columnMap = headerInfo.columnMap;
  return {
    employeeName,
    workDays: getMetric(rawRow, textRow, columnMap.workDays),
    overtime: getMetric(rawRow, textRow, columnMap.overtime),
    late: getMetric(rawRow, textRow, columnMap.late),
    early: getMetric(rawRow, textRow, columnMap.early),
    otherDeduction: getMetric(rawRow, textRow, columnMap.otherDeduction),
    penalty: getMetric(rawRow, textRow, columnMap.penalty),
  };
}

function excelSerialToMonthKey(XLSX, serial) {
  if (typeof serial !== "number" || !Number.isFinite(serial)) return "";
  const parsed = XLSX.SSF.parse_date_code(serial);
  if (!parsed?.y || !parsed?.m) return "";
  return `${parsed.y}-${String(parsed.m).padStart(2, "0")}`;
}

function textToMonthKey(value) {
  const text = compactText(value);
  if (!text) return "";

  const iso = text.match(/(20\d{2})[-/.](\d{1,2})(?:[-/.]\d{1,2})?/);
  if (iso) return `${iso[1]}-${String(Number(iso[2])).padStart(2, "0")}`;

  const vietnamese = text.match(/(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2})/);
  if (vietnamese) return `${vietnamese[3]}-${String(Number(vietnamese[2])).padStart(2, "0")}`;

  return "";
}

function fileNameToMonthKey(fileName) {
  const match = String(fileName ?? "").match(/(20\d{2})[-_ ]?(\d{2})/);
  return match ? `${match[1]}-${match[2]}` : "";
}

function collectMonthKey({ XLSX, rawValue, textValue, fileName }) {
  return excelSerialToMonthKey(XLSX, rawValue) ||
    textToMonthKey(textValue) ||
    fileNameToMonthKey(fileName);
}

function getMetric(rawRow, textRow, columnIndex) {
  if (columnIndex < 0) return 0;
  return parseNumber(rawRow?.[columnIndex], textRow?.[columnIndex]);
}

function shouldSkipPenaltyFromCategory(text) {
  const normalized = normalizeHeader(text);
  if (!normalized) return false;
  return normalized.includes("khong phat") ||
    normalized.includes("mien phat") ||
    normalized.includes("co phep") ||
    normalized === "phep" ||
    normalized.includes("khong tinh phat");
}

function shouldCalculatePenaltyFromCategory(text) {
  const normalized = normalizeHeader(text);
  // File shop thường có cột "Phân loại đi trễ" nhưng để trống. Khi đó
  // cột Đi trễ đã là dữ liệu cần tính phạt, nên vẫn phải tính tiền phạt.
  if (!normalized) return true;
  if (shouldSkipPenaltyFromCategory(text)) return false;
  return normalized.includes("phat") || normalized.includes("di tre");
}

function getPenaltyMetric(rawRow, textRow, columnMap, employeeName) {
  const explicitPenalty = getMetric(rawRow, textRow, columnMap.penalty);
  if (explicitPenalty > 0) return explicitPenalty;

  const lateMinutes = getMetric(rawRow, textRow, columnMap.late);
  if (lateMinutes <= 0) return 0;

  const hasPenaltyColumn = columnMap.penalty >= 0;
  const penaltyText = getTextCell(textRow, columnMap.penalty);
  const isPenaltyCategoryColumn = columnMap.penaltyHeader === "phan loai di tre";

  if (hasPenaltyColumn && !isPenaltyCategoryColumn) {
    // Với cột số tiền rõ ràng như "Phạt"/"Tiền phạt", nếu ô đang trống
    // hoặc bằng 0 thì tôn trọng dữ liệu nguồn, không tự tính lại.
    return 0;
  }

  if (isPenaltyCategoryColumn && !shouldCalculatePenaltyFromCategory(penaltyText)) {
    return 0;
  }

  return Number(calculateLatePenalty(lateMinutes, employeeName)) || 0;
}

function makeUniqueListText(values = []) {
  return Array.from(values)
    .map(compactText)
    .filter(Boolean)
    .filter((value, index, array) =>
      array.findIndex((item) => normalizeHeader(item) === normalizeHeader(value)) === index,
    )
    .join(" / ");
}

function makeRecordKey({ sourceFileName, employeeCode, employeeName, fullName }) {
  const normalizedFullName = normalizeHeader(fullName);
  if (normalizedFullName) return ["FULL_NAME", normalizedFullName].join("||");

  return [
    "SOURCE_EMPLOYEE",
    sourceFileName,
    employeeCode || "NO_CODE",
    normalizeHeader(employeeName || "NO_NAME"),
  ].join("||");
}

function createAggregateRecord({ sourceFileName, employeeCode, employeeName, fullName }) {
  return {
    employeeCode,
    employeeName,
    fullName,
    sourceFileName,
    employeeCodes: new Set(employeeCode ? [employeeCode] : []),
    employeeNames: new Set(employeeName ? [employeeName] : []),
    fullNames: new Set(fullName ? [fullName] : []),
    sourceFileNames: new Set(sourceFileName ? [sourceFileName] : []),
    workDays: 0,
    overtime: 0,
    late: 0,
    early: 0,
    otherDeduction: 0,
    penalty: 0,
  };
}

function mergeRecordIdentity(record, { sourceFileName, employeeCode, employeeName, fullName }) {
  if (employeeCode) record.employeeCodes.add(employeeCode);
  if (employeeName) record.employeeNames.add(employeeName);
  if (fullName) record.fullNames.add(fullName);
  if (sourceFileName) record.sourceFileNames.add(sourceFileName);

  record.employeeCode = record.employeeCode || employeeCode;
  record.employeeName = record.employeeName || employeeName;
  record.fullName = record.fullName || fullName;
  record.sourceFileName = record.sourceFileName || sourceFileName;
}


function recordHasSourceFile(record, sourceFileName) {
  const normalizedSource = normalizeHeader(sourceFileName);
  if (!normalizedSource) return true;
  const sourceValues = record.sourceFileNames?.size ? Array.from(record.sourceFileNames) : [record.sourceFileName];
  return sourceValues.some((value) => normalizeHeader(value) === normalizedSource);
}

function recordHasEmployeeName(record, employeeName) {
  const normalizedName = normalizeHeader(employeeName);
  if (!normalizedName) return false;
  const names = record.employeeNames?.size ? Array.from(record.employeeNames) : [record.employeeName];
  return names.some((value) => normalizeHeader(value) === normalizedName);
}

function findRecordKeyByEmployeeSheetName(aggregateMap, sourceFileName, employeeName) {
  for (const [key, record] of aggregateMap.entries()) {
    if (recordHasSourceFile(record, sourceFileName) && recordHasEmployeeName(record, employeeName)) {
      return key;
    }
  }
  for (const [key, record] of aggregateMap.entries()) {
    if (recordHasEmployeeName(record, employeeName)) return key;
  }
  return "";
}

function applyEmployeeSheetSummary({ aggregateMap, order, sourceFileName, summary }) {
  if (!summary?.employeeName) return false;
  const hasAnyMetric = [
    summary.workDays,
    summary.overtime,
    summary.late,
    summary.early,
    summary.otherDeduction,
    summary.penalty,
  ].some((value) => Math.abs(Number(value) || 0) > 0);
  if (!hasAnyMetric) return false;

  let key = findRecordKeyByEmployeeSheetName(aggregateMap, sourceFileName, summary.employeeName);
  if (!key) {
    key = makeRecordKey({
      sourceFileName,
      employeeCode: "",
      employeeName: summary.employeeName,
      fullName: "",
    });
    if (!aggregateMap.has(key)) {
      aggregateMap.set(key, createAggregateRecord({
        sourceFileName,
        employeeCode: "",
        employeeName: summary.employeeName,
        fullName: "",
      }));
      order.push(key);
    }
  }

  const record = aggregateMap.get(key);
  mergeRecordIdentity(record, {
    sourceFileName,
    employeeCode: "",
    employeeName: summary.employeeName,
    fullName: "",
  });

  // Employee sheets were generated from the Summary box. Use them as a supplement
  // for Phạt because the source detail sheet can have an empty "Phân loại đi trễ".
  // Do not re-add workdays/overtime/late/early/other here because the main shop
  // sheet already supplies those values.
  if ((Number(record.penalty) || 0) <= 0 && (Number(summary.penalty) || 0) > 0) {
    record.penalty = Number(summary.penalty) || 0;
  }
  return true;
}

function addToAggregate(record, rawRow, textRow, columnMap) {
  record.workDays += getMetric(rawRow, textRow, columnMap.workDays);
  record.overtime += getMetric(rawRow, textRow, columnMap.overtime);
  record.late += getMetric(rawRow, textRow, columnMap.late);
  record.early += getMetric(rawRow, textRow, columnMap.early);
  record.otherDeduction += getMetric(rawRow, textRow, columnMap.otherDeduction);
  record.penalty += getPenaltyMetric(rawRow, textRow, columnMap, record.employeeName || record.fullName);
}

function parseSheetRows({ XLSX, sheet, sheetName, fileName, aggregateMap, order, monthKeys }) {
  const textRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: false });
  const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true });
  const headerInfo = findHeaderRow(textRows);
  if (!headerInfo) {
    const employeeSheetSummary = parseEmployeeSheetSummary({
      sheetName,
      textRows,
      rawRows,
    });
    if (employeeSheetSummary && applyEmployeeSheetSummary({
      aggregateMap,
      order,
      sourceFileName: fileName,
      summary: employeeSheetSummary,
    })) {
      return { parsed: true, sheetName, rowCount: 1, source: "employeeSummary" };
    }
    return { parsed: false, sheetName, rowCount: 0 };
  }

  const { rowIndex: headerRowIndex, columnMap } = headerInfo;
  let rowCount = 0;
  for (let index = headerRowIndex + 1; index < textRows.length; index += 1) {
    const textRow = textRows[index] ?? [];
    const rawRow = rawRows[index] ?? [];
    const employeeCode = getTextCell(textRow, columnMap.employeeCode);
    const employeeName = getTextCell(textRow, columnMap.employeeName);
    const fullName = getTextCell(textRow, columnMap.fullName);
    if (!employeeCode && !employeeName && !fullName) continue;

    const metricTotal = [
      columnMap.workDays,
      columnMap.overtime,
      columnMap.late,
      columnMap.early,
      columnMap.otherDeduction,
      columnMap.penalty,
    ].reduce((total, columnIndex) => total + Math.abs(getMetric(rawRow, textRow, columnIndex)), 0);
    if (metricTotal === 0 && !employeeCode && !employeeName) continue;

    const monthKey = columnMap.day >= 0
      ? collectMonthKey({
          XLSX,
          rawValue: rawRow[columnMap.day],
          textValue: textRow[columnMap.day],
          fileName,
        })
      : fileNameToMonthKey(fileName);
    if (monthKey) monthKeys.add(monthKey);

    const sourceFileName = fileName;
    const key = makeRecordKey({ sourceFileName, employeeCode, employeeName, fullName });
    if (!aggregateMap.has(key)) {
      aggregateMap.set(key, createAggregateRecord({
        sourceFileName,
        employeeCode,
        employeeName,
        fullName,
      }));
      order.push(key);
    }
    const record = aggregateMap.get(key);
    mergeRecordIdentity(record, { sourceFileName, employeeCode, employeeName, fullName });
    addToAggregate(record, rawRow, textRow, columnMap);
    rowCount += 1;
  }

  return { parsed: true, sheetName, rowCount };
}

function normalizeAggregatedRecord(record) {
  const overtime = roundMinutes(record.overtime);
  const late = roundMinutes(record.late);
  const early = roundMinutes(record.early);
  const otherDeduction = roundMinutes(record.otherDeduction);
  const penalty = roundMinutes(record.penalty);
  const balance = overtime - late - early - otherDeduction;
  const employeeCode = makeUniqueListText(record.employeeCodes?.size ? record.employeeCodes : [record.employeeCode]);
  const employeeName = makeUniqueListText(record.employeeNames?.size ? record.employeeNames : [record.employeeName]);
  const fullName = makeUniqueListText(record.fullNames?.size ? record.fullNames : [record.fullName]);
  const sourceFileName = makeUniqueListText(record.sourceFileNames?.size ? record.sourceFileNames : [record.sourceFileName]);

  return {
    ...record,
    employeeCode,
    employeeName,
    fullName,
    sourceFileName,
    workDays: roundOne(record.workDays),
    overtime,
    late,
    early,
    otherDeduction,
    balance,
    penalty,
  };
}

function latestMonthKey(monthKeys, fallbackDate = new Date()) {
  const sorted = Array.from(monthKeys).filter(Boolean).sort();
  if (sorted.length) return sorted.at(-1);
  return `${fallbackDate.getFullYear()}-${String(fallbackDate.getMonth() + 1).padStart(2, "0")}`;
}

function makeSummarySheetName(monthKey) {
  const [year, month] = monthKey.split("-");
  return `TH_T${month}_${year}`.slice(0, 31);
}

function makeSummaryFileName(monthKey, now = new Date()) {
  const [year, month] = monthKey.split("-");
  const dateStamp = [
    String(now.getDate()).padStart(2, "0"),
    String(now.getMonth() + 1).padStart(2, "0"),
    now.getFullYear(),
  ].join("");
  const timeStamp = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");
  return `ChamCong_Tổng_hợp_T${month}_${year}_${dateStamp}_${timeStamp}.xlsx`;
}

function buildSummaryRows(records) {
  return [
    SHOP_SUMMARY_HEADERS,
    ...records.map((record) => [
      record.employeeCode,
      record.employeeName,
      record.fullName,
      record.sourceFileName,
      record.workDays,
      record.overtime,
      record.late,
      record.early,
      record.otherDeduction,
      record.balance,
      record.penalty,
    ]),
  ];
}

function applySummaryStyles(XLSX, worksheet, rowCount) {
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1:K1");
  worksheet["!cols"] = [
    { wch: 12 },
    { wch: 20 },
    { wch: 28 },
    { wch: 36 },
    { wch: 12 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 15 },
    { wch: 14 },
    { wch: 20 },
  ];
  worksheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  worksheet["!autofilter"] = { ref: XLSX.utils.encode_range(range) };

  for (let col = range.s.c; col <= range.e.c; col += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: col });
    worksheet[address] ??= { t: "s", v: "" };
    worksheet[address].s = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "1F4E78" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      border: {
        top: { style: "thin", color: { rgb: "D9E2F3" } },
        bottom: { style: "thin", color: { rgb: "D9E2F3" } },
        left: { style: "thin", color: { rgb: "D9E2F3" } },
        right: { style: "thin", color: { rgb: "D9E2F3" } },
      },
    };
  }

  for (let row = 1; row < rowCount; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[address];
      if (!cell) continue;
      cell.s = {
        alignment: {
          horizontal: col >= 4 ? "right" : "left",
          vertical: "center",
          wrapText: col === 2 || col === 3,
        },
        border: {
          bottom: { style: "thin", color: { rgb: "E5E7EB" } },
        },
      };
      if (col >= 4) cell.z = col === 4 ? "0.0" : "#,##0";
    }
  }
}

async function buildSummaryWorkbook({ XLSX, XLSX_STYLE, records, monthKey }) {
  const workbook = XLSX.utils.book_new();
  const rows = buildSummaryRows(records);
  const worksheet = XLSX.utils.aoa_to_sheet(rows);
  applySummaryStyles(XLSX, worksheet, rows.length);
  XLSX.utils.book_append_sheet(workbook, worksheet, makeSummarySheetName(monthKey));
  const buffer = XLSX_STYLE.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
    compression: true,
  });
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function compareText(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), "vi", {
    numeric: true,
    sensitivity: "base",
  });
}

function compareShopSummaryRecords(left, right) {
  return compareText(left.sourceFileName, right.sourceFileName) ||
    compareText(left.employeeCode, right.employeeCode) ||
    compareText(left.employeeName, right.employeeName) ||
    compareText(left.fullName, right.fullName);
}

export async function createShopSummaryWorkbook(files = [], { now = new Date() } = {}) {
  const { XLSX, XLSX_STYLE } = await loadXlsxRuntime();
  const aggregateMap = new Map();
  const order = [];
  const monthKeys = new Set();
  const parsedSheets = [];
  const skippedSheets = [];

  for (const file of files) {
    const fileName = file?.name || "shop.xlsx";
    const arrayBuffer = await file.arrayBuffer();
    const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: false });
    const fileMonthKey = fileNameToMonthKey(fileName);
    if (fileMonthKey) monthKeys.add(fileMonthKey);

    workbook.SheetNames.forEach((sheetName) => {
      const result = parseSheetRows({
        XLSX,
        sheet: workbook.Sheets[sheetName],
        sheetName,
        fileName,
        aggregateMap,
        order,
        monthKeys,
      });
      if (result.parsed) parsedSheets.push({ fileName, ...result });
      else skippedSheets.push({ fileName, sheetName });
    });
  }

  const records = order
    .map((key) => normalizeAggregatedRecord(aggregateMap.get(key)))
    .filter((record) => record.employeeCode || record.employeeName || record.fullName)
    .sort(compareShopSummaryRecords);
  const monthKey = latestMonthKey(monthKeys, now);
  const blob = await buildSummaryWorkbook({ XLSX, XLSX_STYLE, records, monthKey });
  const fileName = makeSummaryFileName(monthKey, now);

  return {
    blob,
    fileName,
    monthKey,
    records,
    totalRows: records.length,
    sourceFileCount: files.length,
    parsedSheetCount: parsedSheets.length,
    skippedSheetCount: skippedSheets.length,
    parsedSheets,
    skippedSheets,
  };
}

export function downloadShopSummaryFile(blob, fileName) {
  downloadExcelBlob(blob, fileName);
}

export { SHOP_SUMMARY_HEADERS };
