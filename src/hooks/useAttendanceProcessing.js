import { useMemo, useRef, useState } from "react";
import { normalizeBranch } from "../branches/branchModel";
import {
  normalizeEmployeeCode,
  normalizeLookup,
  normalizeText,
} from "../employees/employeeModel";
import {
  downloadProcessedFile,
  mergeProcessedExcelResults,
  processExcelFile,
} from "../excel/excelProcessor";
import {
  createProcessQueueId,
  formatEmployeeBrief,
  getEmployeeBranch,
  getEmployeeFilterKey,
  validateProcessFile,
} from "../utils/processFileUtils";

/** Quản lý filter, hàng đợi và pipeline xử lý file của ProcessPage. */
export function useAttendanceProcessing({ employees, diaryEntries, shiftRules }) {
  const inputRef = useRef(null);
  const [selectedFiles, setSelectedFiles] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [batchError, setBatchError] = useState("");
  const [batchWarning, setBatchWarning] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [exportMode, setExportMode] = useState("merged");
  const [mergedResult, setMergedResult] = useState(null);
  const [processFilters, setProcessFilters] = useState({
    branches: [],
    employeeIds: [],
    dateFrom: "",
    dateTo: "",
    onlyMatchingRows: true,
  });

  const branchOptions = useMemo(
    () => Array.from(
      new Set(employees.map(({ branch }) => normalizeBranch(branch)).filter(Boolean)),
    ).sort((first, second) => first.localeCompare(second, "vi-VN")),
    [employees],
  );

  const visibleEmployees = useMemo(() => {
    const query = normalizeLookup(employeeSearch);
    if (!query) return employees;
    return employees.filter((employee) =>
      normalizeLookup(
        `${employee.employeeCode} ${employee.employeeName} ${employee.branch}`,
      ).includes(query),
    );
  }, [employeeSearch, employees]);

  const selectedEmployeeRecords = useMemo(() => {
    const selectedKeys = new Set(processFilters.employeeIds);
    if (!selectedKeys.size) return [];
    return employees.filter((employee) =>
      selectedKeys.has(getEmployeeFilterKey(employee)),
    );
  }, [employees, processFilters.employeeIds]);

  const selectedEmployeeCodes = useMemo(() => {
    const codes = [
      ...selectedEmployeeRecords.map((employee) =>
        normalizeEmployeeCode(employee.employeeCode)),
      ...processFilters.employeeIds.map(normalizeEmployeeCode),
    ].filter(Boolean);
    return Array.from(new Set(codes));
  }, [processFilters.employeeIds, selectedEmployeeRecords]);

  const selectedEmployeeBranches = useMemo(() => Array.from(new Set(
    selectedEmployeeRecords.map(getEmployeeBranch).filter(Boolean),
  )).sort((first, second) => first.localeCompare(second, "vi-VN")), [
    selectedEmployeeRecords,
  ]);

  const selectedEmployeesForExport = useMemo(
    () => selectedEmployeeRecords.map((employee) => ({
      id: employee.id,
      employeeCode: normalizeEmployeeCode(employee.employeeCode) || employee.employeeCode,
      employeeName: normalizeText(employee.employeeName),
      branch: getEmployeeBranch(employee),
    })),
    [selectedEmployeeRecords],
  );

  const successfulFiles = selectedFiles.filter(
    ({ status, resultFile }) => status === "success" && resultFile,
  );
  const processableFiles = selectedFiles.filter(
    ({ validationError }) => !validationError,
  );
  const completedCount = selectedFiles.filter(
    ({ status }) => status === "success" || status === "error",
  ).length;
  const hasActiveFilters = Boolean(
    processFilters.branches.length ||
    processFilters.employeeIds.length ||
    processFilters.dateFrom ||
    processFilters.dateTo,
  );

  function invalidateResults() {
    setBatchError("");
    setBatchWarning("");
    setMergedResult(null);
    setSelectedFiles((current) => current.map((item) => item.validationError
      ? item
      : {
          ...item,
          status: "pending",
          progress: 0,
          resultFile: null,
          processedMeta: null,
          errorMessage: "",
        }));
  }

  function updateProcessFilters(updater) {
    setProcessFilters((current) =>
      typeof updater === "function" ? updater(current) : updater);
    invalidateResults();
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
        progress: 0,
        resultFile: null,
        errorMessage: validationError,
        validationError,
      };
    });
    if (nextItems.length) {
      setBatchError("");
      setBatchWarning("");
      setMergedResult(null);
      setSelectedFiles((current) => [
        ...current.map((item) => item.validationError ? item : {
          ...item,
          status: "pending",
          progress: 0,
          resultFile: null,
          processedMeta: null,
        }),
        ...nextItems,
      ]);
    }
  }

  function updateQueueItem(id, updates) {
    setSelectedFiles((current) => current.map((item) =>
      item.id === id ? { ...item, ...updates } : item));
  }

  function toggleFilterValue(field, value) {
    updateProcessFilters((current) => {
      const values = current[field];
      return {
        ...current,
        [field]: values.includes(value)
          ? values.filter((item) => item !== value)
          : [...values, value],
      };
    });
  }

  function handleExportModeChange(nextMode) {
    setExportMode(nextMode);
    setBatchError("");
    invalidateResults();
  }

  async function handleProcessAllFiles() {
    setBatchError("");
    setBatchWarning("");
    if (
      processFilters.dateFrom &&
      processFilters.dateTo &&
      processFilters.dateFrom > processFilters.dateTo
    ) {
      setBatchError("Khoảng ngày không hợp lệ: Từ ngày phải trước hoặc bằng Đến ngày.");
      return;
    }

    const effectiveFilters = {
      ...processFilters,
      onlyMatchingRows: exportMode === "merged" ? true : processFilters.onlyMatchingRows,
    };
    console.debug("Selected employees for export", selectedEmployeeCodes);
    const mergedCandidates = [];
    setMergedResult(null);
    setIsProcessing(true);
    try {
      for (const item of selectedFiles) {
        if (item.validationError) continue;
        updateQueueItem(item.id, {
          status: "processing",
          progress: 20,
          resultFile: null,
          errorMessage: "",
        });
        try {
          const result = await processExcelFile(item.file, employees, {
            shiftRules,
            diaryEntries,
            processFilters: effectiveFilters,
            includeProcessedSheet: exportMode === "merged",
          });
          if (exportMode === "merged") mergedCandidates.push(result);
          updateQueueItem(item.id, {
            status: "success",
            progress: 100,
            processedMeta: {
              totalRows: result.totalRows,
              filteredOutRows: result.filteredOutRows,
            },
            resultFile: exportMode === "separate"
              ? result
              : null,
          });
        } catch (error) {
          updateQueueItem(item.id, {
            status: "error",
            progress: 0,
            resultFile: null,
            errorMessage: error.message || "Không thể xử lý file Excel này.",
          });
        }
      }
      if (exportMode === "merged") {
        try {
          const nextMergedResult = await mergeProcessedExcelResults(mergedCandidates, {
            processFilters: effectiveFilters,
            selectedEmployees: selectedEmployeesForExport,
          });
          setMergedResult(nextMergedResult);
          if (nextMergedResult.missingEmployees?.length) {
            setBatchWarning(
              `Không tìm thấy dữ liệu chấm công cho: ${nextMergedResult.missingEmployees.map(formatEmployeeBrief).join(", ")}`,
            );
          }
        } catch (error) {
          setBatchError(error.message || "Không thể tạo file Excel tổng hợp.");
        }
      }
    } finally {
      setIsProcessing(false);
    }
  }

  function handleDownloadAll() {
    successfulFiles.forEach(({ resultFile }, index) => {
      window.setTimeout(() => {
        downloadProcessedFile(resultFile.blob, resultFile.fileName);
      }, index * 180);
    });
  }

  function clearQueue() {
    setBatchError("");
    setBatchWarning("");
    setMergedResult(null);
    setSelectedFiles([]);
  }

  function removeQueueItem(id) {
    setBatchError("");
    setBatchWarning("");
    setMergedResult(null);
    setSelectedFiles((current) => current.filter((item) => item.id !== id));
  }

  return {
    addSelectedFiles,
    batchError,
    batchWarning,
    branchOptions,
    clearQueue,
    completedCount,
    employeeSearch,
    exportMode,
    handleDownloadAll,
    handleExportModeChange,
    handleProcessAllFiles,
    hasActiveFilters,
    inputRef,
    isDragging,
    isProcessing,
    mergedResult,
    processFilters,
    processableFiles,
    removeQueueItem,
    selectedEmployeeBranches,
    selectedFiles,
    setEmployeeSearch,
    setIsDragging,
    successfulFiles,
    toggleFilterValue,
    updateProcessFilters,
    visibleEmployees,
  };
}
