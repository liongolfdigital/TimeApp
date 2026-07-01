import JSZip from "jszip";
import { makeEmployeeAttendancePdfFiles, PDF_FOLDER_NAME } from "./pdfEmployeeSheets.js";

function stripExcelExtension(fileName = "") {
  return String(fileName || "Ket_qua").replace(/\.xlsx$/i, "");
}

function sanitizePackageName(name = "") {
  const cleaned = String(name || "Ket_qua")
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return cleaned || "Ket_qua";
}

async function toZipFileData(data) {
  if (!data) return "";
  if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) return data;
  if (typeof Blob !== "undefined" && data instanceof Blob) {
    return data.arrayBuffer();
  }
  if (typeof data.arrayBuffer === "function") {
    return data.arrayBuffer();
  }
  return data;
}

export async function buildAttendanceExportPackage({
  excelBlob,
  excelFileName,
  employeeDetailRows = [],
  employeeSummaries = [],
}) {
  const safeExcelFileName = String(excelFileName || "Ket_qua.xlsx").endsWith(".xlsx")
    ? String(excelFileName || "Ket_qua.xlsx")
    : `${String(excelFileName || "Ket_qua")}.xlsx`;
  const folderName = sanitizePackageName(stripExcelExtension(safeExcelFileName));
  const zip = new JSZip();
  const rootFolder = zip.folder(folderName) || zip;
  rootFolder.file(safeExcelFileName, await toZipFileData(excelBlob));

  const pdfFiles = await makeEmployeeAttendancePdfFiles(employeeDetailRows, employeeSummaries);
  if (pdfFiles.length) {
    const pdfFolder = rootFolder.folder(PDF_FOLDER_NAME) || rootFolder;
    for (const { fileName, blob } of pdfFiles) {
      pdfFolder.file(fileName, await toZipFileData(blob));
    }
  }

  const zipData = await zip.generateAsync({
    // Dùng uint8array để chạy ổn cả browser lẫn Node verify.
    // Sau đó bọc lại thành Blob để flow download hiện tại không đổi.
    type: "uint8array",
    compression: "DEFLATE",
    compressionOptions: { level: 6 },
  });
  const zipBlob = new Blob([zipData], { type: "application/zip" });

  return {
    blob: zipBlob,
    fileName: `${folderName}.zip`,
    folderName,
    excelFileName: safeExcelFileName,
    pdfCount: pdfFiles.length,
  };
}
