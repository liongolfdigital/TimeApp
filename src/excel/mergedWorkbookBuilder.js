/**
 * Ghép các worksheet đã xử lý thành workbook tổng hợp và tạo sheet nhân viên thiếu dữ liệu.
 * Module giữ nguyên thứ tự cột, style, summary và contract metadata của luồng cũ.
 */
import { detectBranchFromText, normalizeBranch } from "../branches/branchModel.js";
import {
  KEPT_COLUMNS,
  OUTPUT_COLUMNS,
  SUMMARY_COLUMNS,
} from "../constants/excelConstants.js";
import {
  normalizeEmployeeCode,
  normalizeLookup,
  normalizeText,
} from "../employees/employeeModel.js";
import { appendEmployeeAttendanceSheets } from "./employeeSheetsBuilder.js";
import { makeMergedOutputFileName } from "./excelFileNames.js";
import { writeEmployeeSummaryBox } from "./excelSummaryService.js";
import {
  cloneCell,
  normalizeDateCellsForStyledWrite,
} from "./excelWriter.js";
import { loadXlsxRuntime } from "./xlsxRuntime.js";

export const MERGED_SOURCE_COLUMN = "Nguồn file";
export const MERGED_BRANCH_COLUMN = "Chi nhánh";
export const MERGED_SHEET_NAME = "Tổng hợp";
export const MISSING_EMPLOYEE_SHEET_NAME = "Không tìm thấy";
const MISSING_EMPLOYEE_NOTE = "Không có dữ liệu trong các file đã tải lên";

function getCellDisplayValue(XLSX, cell) {
  return cell ? XLSX.utils.format_cell(cell) : "";
}

function getEmployeeReportKey(employee) {
  return normalizeEmployeeCode(employee?.employeeCode) ||
    normalizeLookup(employee?.employeeName) ||
    normalizeLookup(employee?.id);
}

function buildSelectedEmployeeReports(selectedEmployees = [], processFilters = {}) {
  const reports = [];
  const seen = new Set();
  const pushReport = (employee) => {
    const key = getEmployeeReportKey(employee);
    if (!key || seen.has(key)) return;
    seen.add(key);
    reports.push({
      key,
      employeeCode:
        normalizeEmployeeCode(employee.employeeCode) ||
        String(employee.employeeCode ?? employee.id ?? ""),
      employeeName: normalizeText(employee.employeeName),
      branch: normalizeBranch(employee.branch) || detectBranchFromText(employee.employeeName),
    });
  };

  selectedEmployees.forEach(pushReport);

  if (!reports.length) {
    (processFilters.employeeIds ?? []).forEach((employeeId) => {
      const code = normalizeEmployeeCode(employeeId);
      const key = code || normalizeLookup(employeeId);
      if (!key || seen.has(key)) return;
      seen.add(key);
      reports.push({
        key,
        employeeCode: code || String(employeeId ?? ""),
        employeeName: "",
        branch: "",
      });
    });
  }

  return reports;
}

function appendMissingEmployeesSheet(XLSX, workbook, missingEmployees) {
  if (!missingEmployees.length) return;
  const rows = [
    ["Mã N.Viên", "Tên N.Viên", "Chi nhánh", "Ghi chú"],
    ...missingEmployees.map((employee) => [
      employee.employeeCode,
      employee.employeeName,
      employee.branch,
      MISSING_EMPLOYEE_NOTE,
    ]),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [{ wch: 14 }, { wch: 28 }, { wch: 12 }, { wch: 42 }];
  for (let column = 0; column < rows[0].length; column += 1) {
    const address = XLSX.utils.encode_cell({ r: 0, c: column });
    sheet[address].s = {
      fill: { patternType: "solid", fgColor: { rgb: "FCE4D6" } },
      font: { bold: true, color: { rgb: "7C2D12" } },
      alignment: { vertical: "center", wrapText: true },
    };
  }
  XLSX.utils.book_append_sheet(workbook, sheet, MISSING_EMPLOYEE_SHEET_NAME);
}

/** Thêm cột Chi nhánh/Nguồn file và gom các worksheet đã xử lý thành một workbook duy nhất. */
export async function mergeProcessedExcelResults(
  processedResults,
  { processFilters = {}, fileName = "", selectedEmployees = [] } = {},
) {
  const { XLSX, XLSX_STYLE } = await loadXlsxRuntime();
  const selectedEmployeeReports = buildSelectedEmployeeReports(
    selectedEmployees,
    processFilters,
  );
  const availableResults = (processedResults ?? []).filter(({ processedSheet, totalRows }) =>
    processedSheet && totalRows > 0,
  );
  const totalRows = availableResults.reduce((total, result) => total + result.totalRows, 0);
  if (!totalRows) {
    throw new Error("Không có dữ liệu nào khớp bộ lọc đã chọn.");
  }

  const dataColumnCount = OUTPUT_COLUMNS.length - SUMMARY_COLUMNS.length;
  const dataHeaders = OUTPUT_COLUMNS.slice(0, dataColumnCount);
  const sourceHeaderToColumn = new Map(
    dataHeaders.map((header, index) => [header, index]),
  );
  const branchColumnIndex = Math.max(0, dataHeaders.indexOf("Tên N.Viên")) + 1;
  const mergedDataHeaders = [
    ...dataHeaders.slice(0, branchColumnIndex),
    MERGED_BRANCH_COLUMN,
    ...dataHeaders.slice(branchColumnIndex),
  ];
  const sourceColumnIndex = mergedDataHeaders.length;
  const summaryStartColumn = sourceColumnIndex + 1;
  const mergedHeaders = [
    ...mergedDataHeaders,
    MERGED_SOURCE_COLUMN,
    ...SUMMARY_COLUMNS,
  ];
  const mergedSheet = {};
  const firstResult = availableResults[0];
  const firstSheet = firstResult.processedSheet;
  const firstHeaderRow = firstResult.processedHeaderRow;
  const firstStartColumn = firstResult.processedStartColumn;
  const fallbackStyleColumn = sourceHeaderToColumn.get("Tên N.Viên") ?? 0;

  mergedHeaders.forEach((header, column) => {
    let sourceColumn = sourceHeaderToColumn.get(header);
    if (header === MERGED_BRANCH_COLUMN || header === MERGED_SOURCE_COLUMN) {
      sourceColumn = fallbackStyleColumn;
    }
    if (SUMMARY_COLUMNS.includes(header)) {
      sourceColumn = dataColumnCount + SUMMARY_COLUMNS.indexOf(header);
    }
    const sourceCell = firstSheet[XLSX.utils.encode_cell({
      r: firstHeaderRow,
      c: firstStartColumn + (sourceColumn ?? 0),
    })];
    mergedSheet[XLSX.utils.encode_cell({ r: 0, c: column })] = {
      ...(cloneCell(sourceCell) ?? { t: "s" }),
      t: "s",
      v: header,
      w: header,
    };
  });

  let mergedRow = 1;
  const firstRowsByEmployee = new Map();
  const combinedSummaries = new Map();
  const exportedEmployeeKeys = new Set();
  const mergedEmployeeDetailRows = [];

  availableResults.forEach((result) => {
    for (let offset = 0; offset < result.totalRows; offset += 1) {
      const sourceRow = result.processedHeaderRow + offset + 1;
      const employeeCodeCell = result.processedSheet[XLSX.utils.encode_cell({
        r: sourceRow,
        c: result.processedStartColumn + KEPT_COLUMNS.indexOf("Mã N.Viên"),
      })];
      const employeeNameCell = result.processedSheet[XLSX.utils.encode_cell({
        r: sourceRow,
        c: result.processedStartColumn + KEPT_COLUMNS.indexOf("Tên N.Viên"),
      })];
      const employeeCode = getCellDisplayValue(XLSX, employeeCodeCell);
      const employeeName = getCellDisplayValue(XLSX, employeeNameCell);
      const rowDetail = result.processedRows?.[offset] ?? {};
      const branch = normalizeBranch(rowDetail.branch) ||
        detectBranchFromText(rowDetail.employeeName || employeeName) ||
        detectBranchFromText(result.sourceFileName);
      const employeeKey = normalizeEmployeeCode(employeeCode) || normalizeLookup(employeeName);
      if (employeeKey) {
        exportedEmployeeKeys.add(employeeKey);
        if (!firstRowsByEmployee.has(employeeKey)) {
          firstRowsByEmployee.set(employeeKey, mergedRow);
        }
      }

      mergedDataHeaders.forEach((header, column) => {
        const targetAddress = XLSX.utils.encode_cell({ r: mergedRow, c: column });
        if (header === MERGED_BRANCH_COLUMN) {
          mergedSheet[targetAddress] = {
            ...(cloneCell(employeeNameCell) ?? { t: "s" }),
            t: "s",
            v: branch,
            w: branch,
          };
          return;
        }

        const sourceColumn = sourceHeaderToColumn.get(header);
        const sourceCell = result.processedSheet[XLSX.utils.encode_cell({
          r: sourceRow,
          c: result.processedStartColumn + sourceColumn,
        })];
        if (sourceCell) mergedSheet[targetAddress] = cloneCell(sourceCell);
      });

      mergedSheet[XLSX.utils.encode_cell({ r: mergedRow, c: sourceColumnIndex })] = {
        t: "s",
        v: result.sourceFileName || "",
        s: { alignment: { vertical: "center", wrapText: true } },
      };
      if (result.processedSheet["!rows"]?.[sourceRow]) {
        mergedSheet["!rows"] ??= [];
        mergedSheet["!rows"][mergedRow] =
          structuredClone(result.processedSheet["!rows"][sourceRow]);
      }
      mergedRow += 1;
    }

    (result.employeeSummaries ?? []).forEach((summary) => {
      const key =
        normalizeEmployeeCode(summary.employeeCode) ||
        normalizeLookup(summary.employeeName);
      if (!key) return;
      const combined = combinedSummaries.get(key) ?? {
        ...summary,
        firstRow: firstRowsByEmployee.get(key) ?? 1,
        lateMinutes: 0,
        earlyInMinutes: 0,
        penalty: 0,
        earlyMinutes: 0,
        overtimeMinutes: 0,
        otherDeductionMinutes: 0,
        workDayCount: 0,
        workedDayKeys: [],
      };
      combined.firstRow = Math.min(
        combined.firstRow,
        firstRowsByEmployee.get(key) ?? combined.firstRow,
      );
      combined.lateMinutes += Number(summary.lateMinutes) || 0;
      combined.earlyInMinutes += Number(summary.earlyInMinutes) || 0;
      combined.penalty += Number(summary.penalty) || 0;
      combined.earlyMinutes += Number(summary.earlyMinutes) || 0;
      combined.overtimeMinutes += Number(summary.overtimeMinutes) || 0;
      combined.otherDeductionMinutes += Number(summary.otherDeductionMinutes) || 0;
      const workedDayKeys = new Set(combined.workedDayKeys ?? []);
      (summary.workedDayKeys ?? []).forEach((dayKey) => {
        if (dayKey) workedDayKeys.add(dayKey);
      });
      combined.workedDayKeys = Array.from(workedDayKeys);
      combined.workDayCount = workedDayKeys.size ||
        ((Number(combined.workDayCount) || 0) + (Number(summary.workDayCount) || 0));
      combinedSummaries.set(key, combined);
    });

    (result.employeeDetailRows ?? []).forEach((rowResult) => {
      mergedEmployeeDetailRows.push(rowResult);
    });
  });

  const missingEmployees = selectedEmployeeReports.filter(
    ({ key }) => !exportedEmployeeKeys.has(key),
  );
  let outputEndRow = mergedRow - 1;
  combinedSummaries.forEach((summary) => {
    outputEndRow = Math.max(
      outputEndRow,
      writeEmployeeSummaryBox(XLSX, mergedSheet, 0, summary, summaryStartColumn),
    );
  });

  const firstColumns = firstSheet["!cols"] ?? [];
  mergedSheet["!cols"] = mergedHeaders.map((header) => {
    if (header === MERGED_BRANCH_COLUMN) return { wch: 12 };
    if (header === MERGED_SOURCE_COLUMN) return { wch: 38 };
    if (SUMMARY_COLUMNS.includes(header)) {
      const sourceColumn =
        firstStartColumn + dataColumnCount + SUMMARY_COLUMNS.indexOf(header);
      return firstColumns[sourceColumn]
        ? structuredClone(firstColumns[sourceColumn])
        : { wch: 16 };
    }
    const sourceColumn = sourceHeaderToColumn.get(header);
    return firstColumns[firstStartColumn + sourceColumn]
      ? structuredClone(firstColumns[firstStartColumn + sourceColumn])
      : undefined;
  });
  mergedSheet["!autofilter"] = {
    ref: XLSX.utils.encode_range({
      s: { r: 0, c: 0 },
      e: { r: mergedRow - 1, c: sourceColumnIndex },
    }),
  };
  mergedSheet["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: outputEndRow, c: mergedHeaders.length - 1 },
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, mergedSheet, MERGED_SHEET_NAME);
  appendEmployeeAttendanceSheets(XLSX, workbook, mergedEmployeeDetailRows);
  appendMissingEmployeesSheet(XLSX, workbook, missingEmployees);
  normalizeDateCellsForStyledWrite(workbook);
  const outputBuffer = XLSX_STYLE.write(workbook, {
    bookType: "xlsx",
    type: "array",
    cellStyles: true,
    compression: true,
  });
  return {
    blob: new Blob([outputBuffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    }),
    fileName: fileName || makeMergedOutputFileName(processFilters),
    totalRows,
    sourceFileCount: availableResults.length,
    headers: mergedHeaders,
    selectedEmployeeCount: selectedEmployeeReports.length,
    exportedEmployeeCount: selectedEmployeeReports.length
      ? selectedEmployeeReports.length - missingEmployees.length
      : exportedEmployeeKeys.size,
    missingEmployeeCount: missingEmployees.length,
    missingEmployees,
  };
}
