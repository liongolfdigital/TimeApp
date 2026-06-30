import { isApiUnavailableError } from "../../api/apiClient";
import { diaryApi } from "../../api/diaryApi";
import { isManager } from "../../auth/authorization";
import {
  exportDiaryToExcel,
  importDiaryFromExcel,
} from "../../diary/diaryExcel";
import {
  getDiaryIdentity,
  mergeDiaryEntries,
  sanitizeDiaryEntry,
} from "../../diary/diaryModel";

/** Parse/import/upsert Diary và trả danh sách mới cùng thống kê response. */
export async function importDiaryFile({
  currentUser,
  entries,
  file,
  visibleEntries,
}) {
  const imported = await importDiaryFromExcel(file);
  const scopedImported = isManager(currentUser)
    ? imported.map((entry) =>
        sanitizeDiaryEntry({ ...entry, branch: currentUser.branch }))
    : imported;
  let savedEntries;
  let importResult;
  try {
    importResult = await diaryApi.importEntries(scopedImported);
    savedEntries = await diaryApi.list();
  } catch (error) {
    if (!isApiUnavailableError(error)) throw error;
    console.warn(
      "[TimeKeeping data] Diary bulk API unavailable, importing to localStorage cache.",
      {
        endpoint: error.endpoint,
        status: error.status,
        message: error.message,
      },
    );
    const uniqueImported = new Map(
      scopedImported.map((entry) => [getDiaryIdentity(entry), entry]),
    );
    const existingIdentities = new Set(entries.map(getDiaryIdentity));
    const updatedRows = [...uniqueImported.keys()]
      .filter((identity) => existingIdentities.has(identity)).length;
    savedEntries = mergeDiaryEntries(entries, [...uniqueImported.values()]);
    importResult = {
      receivedRows: imported.length,
      sanitizedRows: scopedImported.length,
      upsertedRows: uniqueImported.size,
      insertedRows: uniqueImported.size - updatedRows,
      updatedRows,
    };
  }
  return { importResult, savedEntries };
}

/** Lấy đúng scope export, gắn attachment và tạo file Diary Excel. */
export async function exportDiaryFile({ attachments, visibleEntries }) {
  let exportEntries;
  try {
    const serverEntries = await diaryApi.listForExport();
    exportEntries = serverEntries.map((entry) => {
      const entryAttachments = attachments.filter(
        ({ diaryEntryId }) => diaryEntryId === entry.id,
      );
      return {
        ...entry,
        attachments: entryAttachments,
        attachedFiles: entryAttachments,
      };
    });
  } catch (error) {
    if (!isApiUnavailableError(error)) throw error;
    exportEntries = visibleEntries;
  }
  await exportDiaryToExcel(exportEntries);
  return exportEntries;
}
