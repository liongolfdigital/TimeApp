/**
 * Public entry cho xử lý/merge/download Excel.
 * Mọi export lịch sử được giữ tại facade này để không đổi contract của UI và verification.
 */
import {
  KEPT_COLUMNS,
  MONTHLY_LATE_WARNING_TEXT,
  OUTPUT_COLUMNS,
  OUTPUT_FILE_NAME,
  PREVIEW_ROW_LIMIT,
  SOURCE_SHEET_NAME,
} from "../constants/excelConstants.js";
import { normalizeEmployeeCode } from "../employees/employeeModel.js";
import { DEFAULT_SHIFT_RULES } from "../rules/shiftRuleEngine.js";
import {
  ENABLE_AUTO_COUNT_EARLY_OVER_60,
  ENABLE_AUTO_COUNT_OVERTIME_OVER_60,
} from "./diaryViolationResolver.js";
import { makeOutputFileName } from "./excelFileNames.js";
import {
  ATTENDANCE_COLOR_MAP,
  applyAttendanceCellStyle,
} from "./excelHighlightService.js";
import { readAttendanceWorkbook } from "./excelReader.js";
import {
  downloadExcelBlob,
  normalizeDateCellsForStyledWrite,
} from "./excelWriter.js";
import {
  MERGED_BRANCH_COLUMN,
  MERGED_SHEET_NAME,
  MERGED_SOURCE_COLUMN,
  MISSING_EMPLOYEE_SHEET_NAME,
  mergeProcessedExcelResults,
} from "./mergedWorkbookBuilder.js";
import { makePreview } from "./previewBuilder.js";
import { createProcessedSheet } from "./processedSheetBuilder.js";
import { matchesProcessFilters } from "./processFilters.js";
import { loadXlsxRuntime } from "./xlsxRuntime.js";

export {
  ATTENDANCE_COLOR_MAP,
  ENABLE_AUTO_COUNT_EARLY_OVER_60,
  ENABLE_AUTO_COUNT_OVERTIME_OVER_60,
  KEPT_COLUMNS,
  MERGED_BRANCH_COLUMN,
  MERGED_SHEET_NAME,
  MERGED_SOURCE_COLUMN,
  MISSING_EMPLOYEE_SHEET_NAME,
  MONTHLY_LATE_WARNING_TEXT,
  OUTPUT_COLUMNS,
  OUTPUT_FILE_NAME,
  SOURCE_SHEET_NAME,
  applyAttendanceCellStyle,
  matchesProcessFilters,
  mergeProcessedExcelResults,
};
export { makeMergedOutputFileName } from "./excelFileNames.js";

/**
 * Đọc/validate workbook, dựng sheet kết quả có style và trả Blob/preview/audit metadata.
 */
export async function processExcelFile(
  file,
  employees = [],
  {
    shiftRules = DEFAULT_SHIFT_RULES,
    diaryEntries = [],
    processFilters = {},
    includeProcessedSheet = false,
  } = {},
) {
  const { XLSX, XLSX_STYLE } = await loadXlsxRuntime();
  const {
    workbook: sourceWorkbook,
    sourceSheet,
    bounds,
    headerRow,
    columnMap,
  } = await readAttendanceWorkbook(file, XLSX);
  const {
    processedSheet,
    matchedRows,
    unmatchedRows,
    determinedShifts,
    adjustmentLogs,
    adjustedRows,
    vpMonthlyLateSummaries,
    appliedShiftRules,
    diaryMatchLogs,
    diaryMatchedRows,
    diaryExemptedRows,
    highlights,
    processedRowCount,
    filteredOutRows,
    employeeSummaries,
    processedEmployees,
    processedRows,
    diaryRows,
  } = createProcessedSheet({
    XLSX,
    sourceSheet,
    headerRow,
    bounds,
    columnMap,
    employees,
    shiftRules,
    diaryEntries,
    processFilters,
    sourceFileName: file?.name || "",
  });
  const outputWorkbook = XLSX.utils.book_new();

  sourceWorkbook.SheetNames.forEach((sheetName) => {
    XLSX.utils.book_append_sheet(
      outputWorkbook,
      sheetName === SOURCE_SHEET_NAME ? processedSheet : sourceWorkbook.Sheets[sheetName],
      sheetName,
    );
  });

  normalizeDateCellsForStyledWrite(outputWorkbook);
  const outputBuffer = XLSX_STYLE.write(outputWorkbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
    compression: true,
  });
  const previewBounds = XLSX.utils.decode_range(processedSheet["!ref"]);
  const preview = makePreview(
    XLSX,
    processedSheet,
    headerRow,
    previewBounds,
    highlights,
    diaryRows,
    processedRowCount,
  );
  const processedEmployeeCodes = new Set(
    processedEmployees.map(normalizeEmployeeCode).filter(Boolean),
  );
  const branchName =
    employees.find((employee) =>
      processedEmployeeCodes.has(normalizeEmployeeCode(employee.employeeCode))
    )?.branch ?? "";

  return {
    blob: new Blob([outputBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    headers: OUTPUT_COLUMNS,
    previewRows: preview.rows,
    previewHighlights: preview.highlights,
    previewDiaryMatches: preview.diaryMatches,
    totalRows: processedRowCount,
    filteredOutRows,
    previewLimit: PREVIEW_ROW_LIMIT,
    matchedRows,
    unmatchedRows,
    determinedShifts,
    adjustmentLogs,
    adjustedRows,
    vpMonthlyLateSummaries,
    appliedShiftRules,
    diaryMatchLogs,
    diaryExemptionLogs: diaryMatchLogs.filter(({ exempted }) => exempted),
    diaryMatchedRows,
    diaryExemptedRows,
    highlights,
    processedRows,
    sourceFileName: file?.name || "",
    fileName: makeOutputFileName(branchName),
    ...(includeProcessedSheet ? {
      processedSheet,
      processedHeaderRow: headerRow,
      processedStartColumn: previewBounds.s.c,
      employeeSummaries,
    } : {}),
  };
}

/** Kích hoạt tải Blob kết quả xuống trình duyệt với tên file đã tạo. */
export function downloadProcessedFile(blob, fileName = OUTPUT_FILE_NAME) {
  downloadExcelBlob(blob, fileName);
}
