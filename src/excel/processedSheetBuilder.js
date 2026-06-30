/**
 * Dựng worksheet kết quả từ sheet Chi tiết.
 * Builder điều phối row processor, summary và style nhưng không serialize workbook.
 */
import {
  KEPT_COLUMNS,
  OUTPUT_COLUMNS,
  SHOP_CLOCK_COLUMNS,
} from "../constants/excelConstants.js";
import { normalizeEmployeeCode } from "../employees/employeeModel.js";
import {
  buildAttendanceHighlights,
} from "./attendanceHighlights.js";
import {
  makeDiaryLookup,
  processAttendanceSourceRow,
} from "./attendanceRowProcessor.js";
import { appendNote } from "./diaryViolationResolver.js";
import { createEmployeeLookup } from "./employeeLookup.js";
import {
  getSourceCell as getMappedSourceCell,
  normalizeHeader,
} from "./excelColumnMapper.js";
import { applyRowHighlights } from "./excelHighlightService.js";
import {
  buildEmployeeSummaries,
  writeEmployeeSummaryBox,
} from "./excelSummaryService.js";
import {
  cloneCell,
  minutesToExcelTime,
  writeCalculatedCell,
} from "./excelWriter.js";
import { applyLongOffWarnings } from "./longOffProcessor.js";

function getSourceCell(XLSX, sourceSheet, columnMap, row, header) {
  return getMappedSourceCell(XLSX, sourceSheet, columnMap, row, header);
}

// Sao chép phần tiêu đề/banner nằm trước dòng header sang worksheet kết quả.
function copyRowsBeforeHeader(XLSX, sourceSheet, targetSheet, headerRow, bounds) {
  for (let row = bounds.s.r; row < headerRow; row += 1) {
    for (let column = bounds.s.c; column <= bounds.e.c; column += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: column });
      if (sourceSheet[address]) targetSheet[address] = cloneCell(sourceSheet[address]);
    }
  }
}

function writeOutputHeaders({
  XLSX,
  sourceSheet,
  targetSheet,
  columnMap,
  headerRow,
  outputStartColumn,
}) {
  OUTPUT_COLUMNS.forEach((header, outputIndex) => {
    const targetAddress = XLSX.utils.encode_cell({
      r: headerRow,
      c: outputStartColumn + outputIndex,
    });

    if (KEPT_COLUMNS.includes(header)) {
      const isCalculatedKeptColumn = header === "Giờ ĐK" || SHOP_CLOCK_COLUMNS.includes(header);
      const sourceCell = isCalculatedKeptColumn
        ? null
        : getSourceCell(XLSX, sourceSheet, columnMap, headerRow, header);
      const styleSource = sourceCell
        ?? getSourceCell(XLSX, sourceSheet, columnMap, headerRow, "Tổng giờ");
      targetSheet[targetAddress] = cloneCell(styleSource) ?? { t: "s", v: header };
      targetSheet[targetAddress].v = header;
      targetSheet[targetAddress].w = header;
      return;
    }

    const styleSource = getSourceCell(
      XLSX,
      sourceSheet,
      columnMap,
      headerRow,
      "Tổng giờ",
    );
    targetSheet[targetAddress] = {
      t: "s",
      v: header,
      w: header,
      ...(styleSource?.s ? { s: structuredClone(styleSource.s) } : {}),
    };
  });
}

function writeCalculatedRows(XLSX, targetSheet, rowResults, outputStartColumn) {
  rowResults.forEach(({ row, calculation }) => {
    const calculatedValues = [
      [calculation.earlyInMinutes, "0"],
      [calculation.lateMinutes, "0"],
      [calculation.penalty, "#,##0"],
      [calculation.earlyMinutes, "0"],
      [calculation.overtimeMinutes, "0"],
      [calculation.otherDeductionMinutes, "0"],
      [calculation.note],
      [minutesToExcelTime(calculation.totalWorkedMinutes), "[hh]:mm"],
    ];
    calculatedValues.forEach(([value, numberFormat], index) => {
      const address = XLSX.utils.encode_cell({
        r: row,
        c: outputStartColumn + KEPT_COLUMNS.length + index,
      });
      writeCalculatedCell(targetSheet, address, value, numberFormat);
    });
  });
}

function copySheetLayout({
  XLSX,
  bounds,
  columnMap,
  headerRow,
  outputDataEndRow,
  outputEndColumn,
  rowResults,
  sourceSheet,
  targetSheet,
}) {
  if (sourceSheet["!rows"]) {
    targetSheet["!rows"] = sourceSheet["!rows"].slice(0, headerRow + 1).map((row) =>
      row ? structuredClone(row) : row,
    );
    rowResults.forEach(({ row, sourceRow }) => {
      const sourceRowStyle = sourceSheet["!rows"][sourceRow];
      if (sourceRowStyle) targetSheet["!rows"][row] = structuredClone(sourceRowStyle);
    });
  }

  const sourceColumns = sourceSheet["!cols"] ?? [];
  targetSheet["!cols"] = KEPT_COLUMNS.map((header) => {
    if (SHOP_CLOCK_COLUMNS.includes(header)) return { wch: 14 };
    const sourceColumn = columnMap.get(normalizeHeader(header));
    return sourceColumns[sourceColumn] ? structuredClone(sourceColumns[sourceColumn]) : undefined;
  });
  targetSheet["!cols"].push(
    { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 34 }, { wch: 14 },
    { wch: 18 }, { wch: 12 },
  );
  targetSheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: headerRow, c: bounds.s.c },
      e: { r: outputDataEndRow, c: outputEndColumn },
    }),
  };
}

/**
 * Xử lý toàn bộ dòng của sheet Chi tiết và trả worksheet cùng metadata preview/audit.
 * Sheet nguồn không bị mutate.
 */
export function createProcessedSheet({
  XLSX,
  bounds,
  columnMap,
  diaryEntries,
  employees,
  headerRow,
  processFilters,
  shiftRules,
  sourceFileName = "",
  sourceSheet,
}) {
  const targetSheet = {};
  const outputStartColumn = bounds.s.c;
  const employeeLookup = createEmployeeLookup(employees);
  const diaryLookup = makeDiaryLookup(diaryEntries);
  let matchedRows = 0;
  let unmatchedRows = 0;
  let filteredOutRows = 0;
  const determinedShifts = [];
  const adjustmentLogs = [];
  const rowResults = [];
  const vpMonthlyLateMinutes = new Map();
  const appliedShiftRules = [];
  const diaryMatchLogs = [];

  copyRowsBeforeHeader(XLSX, sourceSheet, targetSheet, headerRow, bounds);
  writeOutputHeaders({
    XLSX,
    sourceSheet,
    targetSheet,
    columnMap,
    headerRow,
    outputStartColumn,
  });

  for (let sourceRow = headerRow + 1; sourceRow <= bounds.e.r; sourceRow += 1) {
    const result = processAttendanceSourceRow({
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
      targetRow: headerRow + rowResults.length + 1,
      targetSheet,
      vpMonthlyLateMinutes,
    });
    if (result.skipped) continue;
    if (result.filteredOut) {
      filteredOutRows += 1;
      continue;
    }
    if (result.matched) matchedRows += 1;
    else unmatchedRows += 1;
    rowResults.push(result.rowResult);
  }

  // OFF liên tiếp từ hai ngày được đối chiếu Diary riêng và tô tại cột Ghi chú.
  applyLongOffWarnings(rowResults, diaryLookup, diaryMatchLogs, appendNote);
  const highlights = buildAttendanceHighlights(rowResults);
  const employeeSummaries = buildEmployeeSummaries(rowResults);

  writeCalculatedRows(XLSX, targetSheet, rowResults, outputStartColumn);

  const outputDataEndRow = headerRow + rowResults.length;
  let outputEndRow = outputDataEndRow;
  employeeSummaries.forEach((summary) => {
    outputEndRow = Math.max(
      outputEndRow,
      writeEmployeeSummaryBox(XLSX, targetSheet, outputStartColumn, summary),
    );
  });

  const outputEndColumn = outputStartColumn + OUTPUT_COLUMNS.length - 1;
  applyRowHighlights(XLSX, targetSheet, highlights, outputStartColumn);
  targetSheet["!ref"] = XLSX.utils.encode_range({
    s: { r: bounds.s.r, c: outputStartColumn },
    e: { r: outputEndRow, c: outputEndColumn },
  });
  copySheetLayout({
    XLSX,
    bounds,
    columnMap,
    headerRow,
    outputDataEndRow,
    outputEndColumn,
    rowResults,
    sourceSheet,
    targetSheet,
  });

  return {
    processedSheet: targetSheet,
    matchedRows,
    unmatchedRows,
    determinedShifts,
    adjustmentLogs,
    adjustedRows: adjustmentLogs.filter(({ changed }) => changed).length,
    vpMonthlyLateSummaries: Array.from(vpMonthlyLateMinutes.values()),
    appliedShiftRules,
    diaryMatchLogs,
    diaryMatchedRows: diaryMatchLogs.length,
    diaryExemptedRows: diaryMatchLogs.filter(({ exempted }) => exempted).length,
    highlights,
    processedRowCount: rowResults.length,
    filteredOutRows,
    employeeSummaries,
    processedEmployees: rowResults.map(({ employeeCode }) =>
      normalizeEmployeeCode(employeeCode) || employeeCode),
    processedRows: rowResults.map(({ employeeCode, employeeName, branch }) => ({
      employeeCode,
      normalizedEmployeeCode: normalizeEmployeeCode(employeeCode),
      employeeName,
      branch,
    })),
    diaryRows: rowResults.map(({ row, diaryMatched, diaryExempted }) => ({
      row,
      diaryMatched,
      diaryExempted,
    })),
  };
}
