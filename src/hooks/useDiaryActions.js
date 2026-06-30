import { useEffect, useMemo, useRef, useState } from "react";
import {
  canDeleteDiaryEntry,
  canImportExportDiary,
  isManager,
} from "../auth/authorization";
import {
  formatDiaryDate,
} from "../diary/diaryModel";
import {
  confirmAndDeleteSelectedDiaries,
  getVisibleDiarySelectionState,
  toggleAllVisibleDiarySelection,
  toggleDiarySelection,
} from "../diary/diarySelection";
import {
  requestDeleteDiaryIds,
  saveDiaryWithAttachments,
} from "../services/diary/diaryMutationService";
import {
  exportDiaryFile,
  importDiaryFile,
} from "../services/diary/diaryTransferService";

/** CRUD/import/export, attachment transaction và selection của DiaryPage. */
export function useDiaryActions({
  attachments,
  currentUser,
  employees,
  entries,
  filteredEntries,
  onAttachmentsChange,
  onEntriesChange,
  onLogAction,
  visibleDiaryIds,
  visibleEmployees,
  visibleEntries,
}) {
  const importInputRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);
  const [message, setMessage] = useState(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedDiaryIds, setSelectedDiaryIds] = useState([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);
  const [editingEntry, setEditingEntry] = useState(undefined);
  const [selectedEntryId, setSelectedEntryId] = useState("");

  const allowImportExport = canImportExportDiary(currentUser);
  const allowDeleteEntry = canDeleteDiaryEntry(currentUser);
  const selectedEntry = visibleEntries.find(({ id }) => id === selectedEntryId);
  const visibleSelectionState = useMemo(
    () => getVisibleDiarySelectionState(selectedDiaryIds, visibleDiaryIds),
    [selectedDiaryIds, visibleDiaryIds],
  );

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate =
        visibleSelectionState.someSelected;
    }
  }, [visibleSelectionState.someSelected]);

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[TimeKeeping data] diary:filter", {
        currentUser,
        role: currentUser?.role,
        branch: currentUser?.branch,
        rawDiary: entries.length,
        visibleDiary: visibleEntries.length,
        filteredDiary: filteredEntries.length,
      });
    }
  }, [
    currentUser,
    entries.length,
    filteredEntries.length,
    visibleEntries.length,
  ]);

  const saveEntry = async (
    entry,
    { newFiles = [], removedAttachmentIds = [] } = {},
  ) => {
    const result = await saveDiaryWithAttachments({
      attachments,
      currentUser,
      editingEntry,
      employees,
      entry,
      newFiles,
      removedAttachmentIds,
    });
    const nextEntries = editingEntry
      ? entries.map((item) =>
          item.id === result.savedEntry.id ? result.savedEntry : item)
      : [...entries, result.savedEntry];
    onEntriesChange(nextEntries);
    onAttachmentsChange([
      ...attachments.filter(({ id }) => !result.removableIds.includes(id)),
      ...result.uploadedAttachments,
    ]);
    setIsFormOpen(false);
    setEditingEntry(undefined);
    setSelectedEntryId(editingEntry ? result.savedEntry.id : "");
    setMessage({
      type: "success",
      text: `Dữ liệu Diary đã được cập nhật${result.uploadedAttachments.length ? ` cùng ${result.uploadedAttachments.length} file biên bản` : ""}${result.usingLocalDiaryApi && newFiles.length ? ". API file đính kèm chưa sẵn sàng, vui lòng upload lại sau khi server được khởi động đúng." : ""}.`,
    });
    onLogAction?.(editingEntry ? "diary.update.ui" : "diary.create.ui", {
      targetType: "diary",
      targetId: result.savedEntry.id,
      detail: {
        employeeCode: result.savedEntry.employeeCode,
        employeeName: result.savedEntry.employeeName,
        branch: result.savedEntry.branch,
        uploadedCount: result.uploadedAttachments.length,
        removedAttachmentCount: result.removableIds.length,
      },
    });
  };

  const touchEntry = (entryId) => {
    const updatedAt = new Date().toISOString();
    onEntriesChange(entries.map((entry) =>
      entry.id === entryId ? { ...entry, updatedAt } : entry));
  };

  const toggleSelectDiary = (id) => {
    setSelectedDiaryIds((current) => toggleDiarySelection(current, id));
  };

  const toggleSelectAllVisible = () => {
    setSelectedDiaryIds((current) =>
      toggleAllVisibleDiarySelection(current, visibleDiaryIds));
  };

  const applyDeletedDiaryIds = (deletedIds, refreshedEntries) => {
    const deletedSet = new Set(deletedIds);
    onAttachmentsChange(
      attachments.filter(({ diaryEntryId }) => !deletedSet.has(diaryEntryId)),
    );
    onEntriesChange(
      Array.isArray(refreshedEntries)
        ? refreshedEntries
        : entries.filter(({ id }) => !deletedSet.has(id)),
    );
    setSelectedDiaryIds((current) =>
      current.filter((id) => !deletedSet.has(id)));
    if (deletedSet.has(selectedEntryId)) setSelectedEntryId("");
  };

  const deleteEntry = async (entry) => {
    if (!allowDeleteEntry) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }
    if (!window.confirm(
      `Xóa ghi chú Diary ngày ${formatDiaryDate(entry.date)} của ${entry.employeeName || entry.employeeCode} và toàn bộ file đính kèm?`,
    )) return;
    setMessage(null);
    try {
      const result = await requestDeleteDiaryIds([entry.id]);
      if (!result.deletedIds?.includes(entry.id)) {
        throw new Error("Không tìm thấy dòng Diary cần xóa.");
      }
      applyDeletedDiaryIds(result.deletedIds, result.refreshedEntries);
      setMessage({ type: "success", text: "Đã xóa dòng Diary và hồ sơ đính kèm." });
      onLogAction?.("diary.delete.ui", {
        targetType: "diary",
        targetId: entry.id,
        detail: {
          employeeCode: entry.employeeCode,
          employeeName: entry.employeeName,
          branch: entry.branch,
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const handleDeleteSelectedDiaries = async () => {
    if (!allowDeleteEntry || !selectedDiaryIds.length) return;
    setMessage(null);
    setIsDeletingSelected(true);
    try {
      const requestedCount = selectedDiaryIds.length;
      const result = await confirmAndDeleteSelectedDiaries(selectedDiaryIds, {
        confirmDelete: (count) => window.confirm(
          `Bạn có chắc muốn xóa ${count} ghi chú Diary đã chọn không? Hành động này không thể hoàn tác.`,
        ),
        deleteMany: requestDeleteDiaryIds,
      });
      if (!result.confirmed) return;

      applyDeletedDiaryIds(result.deletedIds, result.refreshedEntries);
      const failedCount = requestedCount - result.deletedCount;
      setMessage(failedCount > 0
        ? {
            type: "error",
            text: `Đã xóa ${result.deletedCount} ghi chú Diary; ${failedCount} dòng chưa xóa được và vẫn được chọn.`,
          }
        : {
            type: "success",
            text: `Đã xóa ${result.deletedCount} ghi chú Diary`,
          });
      onLogAction?.("diary.bulk_delete.ui", {
        targetType: "diary",
        detail: { ids: result.deletedIds, deletedCount: result.deletedCount },
      });
    } catch (error) {
      setMessage({
        type: "error",
        text: error.message || "Không thể xóa các ghi chú Diary đã chọn.",
      });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  const handleImport = async (file) => {
    if (!file) return;
    if (!allowImportExport) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }
    setMessage(null);
    setIsImporting(true);
    try {
      const { importResult, savedEntries } = await importDiaryFile({
        currentUser,
        entries,
        file,
        visibleEntries,
      });
      onEntriesChange(savedEntries);
      setMessage({
        type: "success",
        text: `Đã import/upsert ${importResult.upsertedRows} dòng Diary. File đính kèm cần được upload riêng trên trang Diary.`,
      });
      onLogAction?.("diary.import.ui", {
        targetType: "diary",
        detail: {
          importedCount: importResult.upsertedRows,
          receivedCount: importResult.receivedRows,
          sanitizedCount: importResult.sanitizedRows,
          totalCount: savedEntries.length,
          branch: isManager(currentUser) ? currentUser.branch : "ALL",
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  const handleExport = async () => {
    if (!allowImportExport) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }
    setMessage(null);
    try {
      const exportEntries = await exportDiaryFile({
        attachments,
        visibleEntries,
      });
      onLogAction?.("diary.export", {
        targetType: "diary",
        detail: {
          exportedCount: exportEntries.length,
          branch: isManager(currentUser) ? currentUser.branch : "ALL",
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  return {
    allowDeleteEntry,
    allowImportExport,
    closeDetails: () => setSelectedEntryId(""),
    closeForm: () => {
      setIsFormOpen(false);
      setEditingEntry(undefined);
    },
    deleteEntry,
    editingEntry,
    handleDeleteSelectedDiaries,
    handleExport,
    handleImport,
    importInputRef,
    isDeletingSelected,
    isFormOpen,
    isImporting,
    message,
    openCreateForm: () => {
      setEditingEntry(undefined);
      setIsFormOpen(true);
    },
    openDetails: setSelectedEntryId,
    openEditForm: (entry) => {
      setEditingEntry(entry);
      setIsFormOpen(true);
    },
    saveEntry,
    selectAllCheckboxRef,
    selectedDiaryIds,
    selectedEntry,
    setSelectedEntryId,
    toggleSelectAllVisible,
    toggleSelectDiary,
    touchEntry,
    visibleSelectionState,
  };
}
