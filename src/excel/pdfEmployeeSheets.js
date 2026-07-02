import pdfMake from "pdfmake/build/pdfmake.js";
import pdfFonts from "pdfmake/build/vfs_fonts.js";
import {
  EMPLOYEE_ATTENDANCE_HEADERS,
  buildEmployeeAttendanceReports,
  makeEmployeeAttendanceFileBaseName,
} from "./employeeSheetsBuilder.js";

const PDF_FOLDER_NAME = "PDF_nhan_vien";
const SUMMARY_LABEL = "Tổng";

let pdfFontsReady = false;

function ensurePdfFonts() {
  if (pdfFontsReady) return;
  const virtualFileSystem = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs ?? pdfFonts;
  if (virtualFileSystem) {
    pdfMake.vfs = virtualFileSystem;
  }
  pdfFontsReady = true;
}

function normalizePdfText(value) {
  if (value === null || value === undefined) return "";
  return String(value);
}

function formatWorkDayPdfValue(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return normalizePdfText(value);
  return number.toFixed(1);
}

function normalizePdfCellText(value, columnIndex) {
  return columnIndex === 6 ? formatWorkDayPdfValue(value) : normalizePdfText(value);
}

function makeUniquePdfFileName(usedNames, rawName) {
  const base = makeEmployeeAttendanceFileBaseName(rawName).slice(0, 90) || "Nhan_vien";
  let candidate = `${base}.pdf`;
  let index = 2;
  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${base}_${index}.pdf`;
    index += 1;
  }
  usedNames.add(candidate.toLowerCase());
  return candidate;
}

function buildSummaryValues(summary = {}) {
  return [
    SUMMARY_LABEL,
    "",
    "",
    "",
    "",
    "",
    Number(summary.workDayCount) || 0,
    Number(summary.overtimeMinutes) || 0,
    Number(summary.earlyInMinutes) || 0,
    Number(summary.lateMinutes) || 0,
    Number(summary.earlyMinutes) || 0,
    Number(summary.otherDeductionMinutes) || 0,
    Number(summary.penalty) || 0,
    "",
  ];
}

function buildTableBody(report) {
  return [
    EMPLOYEE_ATTENDANCE_HEADERS.map((header) => ({ text: header, style: "tableHeader" })),
    ...report.values.map((values) => values.map((value, columnIndex) => normalizePdfCellText(value, columnIndex))),
    buildSummaryValues(report.summary).map((value, columnIndex) => ({
      text: normalizePdfCellText(value, columnIndex),
      style: "summaryCell",
    })),
  ];
}

function buildDocDefinition(report) {
  return {
    pageSize: "A4",
    pageOrientation: "landscape",
    pageMargins: [18, 22, 18, 22],
    defaultStyle: {
      font: "Roboto",
      fontSize: 7,
    },
    content: [
      {
        text: `BẢNG CHẤM CÔNG THÁNG ${report.monthLabel}`,
        style: "title",
        margin: [0, 0, 0, 4],
      },
      {
        text: `Nhân viên: ${report.employeeName}`,
        style: "employeeName",
        margin: [0, 0, 0, 8],
      },
      {
        table: {
          headerRows: 1,
          widths: [
            42,
            24,
            31,
            31,
            31,
            31,
            34,
            33,
            33,
            33,
            33,
            34,
            36,
            "*",
          ],
          body: buildTableBody(report),
        },
        layout: {
          fillColor(rowIndex) {
            if (rowIndex === 0) return "#E2F0D9";
            if (rowIndex === report.values.length + 1) return "#FFF2CC";
            return null;
          },
          hLineColor() { return "#B7B7B7"; },
          vLineColor() { return "#B7B7B7"; },
          hLineWidth() { return 0.5; },
          vLineWidth() { return 0.5; },
          paddingLeft() { return 2; },
          paddingRight() { return 2; },
          paddingTop() { return 2; },
          paddingBottom() { return 2; },
        },
      },
    ],
    styles: {
      title: {
        bold: true,
        fontSize: 13,
        alignment: "center",
      },
      employeeName: {
        bold: true,
        fontSize: 9,
      },
      tableHeader: {
        bold: true,
        alignment: "center",
      },
      summaryCell: {
        bold: true,
        alignment: "center",
      },
    },
  };
}

function isPromiseLike(value) {
  return Boolean(value && typeof value.then === "function");
}

function resolvePdfMethod(pdf, methodName) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    try {
      const method = pdf?.[methodName];
      if (typeof method !== "function") {
        throw new Error(`pdfmake does not support ${methodName}.`);
      }
      const maybePromise = method.call(pdf, finish);
      if (isPromiseLike(maybePromise)) {
        maybePromise.then(finish, fail);
      }
    } catch (error) {
      fail(error);
    }
  });
}

function createPdfBlob(docDefinition) {
  ensurePdfFonts();
  const pdf = pdfMake.createPdf(docDefinition);

  // Node verify chạy không ổn với getBlob callback của pdfmake browser build.
  // getBuffer hoạt động tốt hơn và JSZip đọc được Uint8Array/ArrayBuffer trực tiếp.
  if (typeof pdf.getBuffer === "function") {
    return resolvePdfMethod(pdf, "getBuffer");
  }
  return resolvePdfMethod(pdf, "getBlob");
}

export async function makeEmployeeAttendancePdfFiles(rowResults = [], employeeSummaries = []) {
  const reports = buildEmployeeAttendanceReports(rowResults, employeeSummaries);
  const usedNames = new Set();
  const files = [];

  for (const report of reports) {
    const fileName = makeUniquePdfFileName(usedNames, report.employeeName);
    const blob = await createPdfBlob(buildDocDefinition(report));
    files.push({ fileName, blob, employeeName: report.employeeName });
  }

  return files;
}

export { PDF_FOLDER_NAME };
