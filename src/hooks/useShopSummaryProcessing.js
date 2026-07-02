import { useRef, useState } from "react";
import {
  createShopSummaryWorkbook,
  downloadShopSummaryFile,
} from "../excel/shopSummaryProcessor.js";
import {
  createProcessQueueId,
  validateProcessFile,
} from "../utils/processFileUtils.js";

export function useShopSummaryProcessing() {
  const inputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [result, setResult] = useState(null);

  const processableFileCount = selectedFiles.filter(({ validationError }) => !validationError).length;

  function invalidateResult() {
    setBatchError("");
    setResult(null);
    setSelectedFiles((current) => current.map((item) => item.validationError
      ? item
      : { ...item, status: "pending", errorMessage: "" }));
  }

  function addSelectedFiles(files) {
    const nextItems = Array.from(files ?? []).map((file) => {
      const validationError = validateProcessFile(file);
      return {
        id: createProcessQueueId(),
        file,
        name: file.name,
        size: file.size,
        status: validationError ? "error" : "pending",
        errorMessage: validationError,
        validationError,
      };
    });
    if (!nextItems.length) return;
    setBatchError("");
    setResult(null);
    setSelectedFiles((current) => [
      ...current.map((item) => item.validationError ? item : { ...item, status: "pending", errorMessage: "" }),
      ...nextItems,
    ]);
  }

  function removeQueueItem(id) {
    setBatchError("");
    setResult(null);
    setSelectedFiles((current) => current.filter((item) => item.id !== id));
  }

  function clearQueue() {
    setBatchError("");
    setResult(null);
    setSelectedFiles([]);
  }

  async function handleProcessFiles() {
    const files = selectedFiles.filter(({ validationError }) => !validationError).map(({ file }) => file);
    if (!files.length) {
      setBatchError("Vui lòng chọn ít nhất một file Excel tổng shop.");
      return;
    }
    setBatchError("");
    setResult(null);
    setIsProcessing(true);
    setSelectedFiles((current) => current.map((item) => item.validationError
      ? item
      : { ...item, status: "processing", errorMessage: "" }));
    try {
      const nextResult = await createShopSummaryWorkbook(files);
      if (!nextResult.totalRows) {
        throw new Error("Không tìm thấy dữ liệu hợp lệ. File cần có các cột Mã N.Viên, Tên N.Viên, Ngày công, Tăng ca, Đi trễ, Về sớm, Trừ khác.");
      }
      setResult(nextResult);
      setSelectedFiles((current) => current.map((item) => item.validationError
        ? item
        : { ...item, status: "success" }));
    } catch (error) {
      setBatchError(error.message || "Không thể tạo file tổng shop.");
      setSelectedFiles((current) => current.map((item) => item.validationError
        ? item
        : { ...item, status: "error", errorMessage: error.message || "Không thể đọc file." }));
    } finally {
      setIsProcessing(false);
    }
  }

  function downloadResult() {
    if (!result?.blob) return;
    downloadShopSummaryFile(result.blob, result.fileName);
  }

  return {
    addSelectedFiles,
    batchError,
    clearQueue,
    downloadResult,
    handleProcessFiles,
    inputRef,
    invalidateResult,
    isDragging,
    isProcessing,
    processableFileCount,
    removeQueueItem,
    result,
    selectedFiles,
    setIsDragging,
  };
}
