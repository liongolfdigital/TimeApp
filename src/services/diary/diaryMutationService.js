import { isApiUnavailableError } from "../../api/apiClient";
import { diaryApi } from "../../api/diaryApi";
import {
  canManageDiaryEntry,
  canModifyAttachment,
  getDiaryEntryBranch,
  isManager,
} from "../../auth/authorization";
import {
  deleteDiaryAttachment,
  uploadDiaryAttachment,
} from "../../diary/attachmentStorage";
import { sanitizeDiaryEntry } from "../../diary/diaryModel";

/** Lưu Diary và áp delta attachment như một workflow có rollback file mới. */
export async function saveDiaryWithAttachments({
  attachments,
  currentUser,
  editingEntry,
  employees,
  entry,
  newFiles,
  removedAttachmentIds,
}) {
  const now = new Date().toISOString();
  const resolvedBranch = getDiaryEntryBranch(entry, employees) ||
    (isManager(currentUser) ? currentUser.branch : "");
  const entryWithBranch = { ...entry, branch: resolvedBranch };
  if (!canManageDiaryEntry(currentUser, entryWithBranch, employees)) {
    throw new Error("Bạn không có quyền truy cập dữ liệu chi nhánh này");
  }

  const sanitized = sanitizeDiaryEntry({
    ...entryWithBranch,
    createdAt: editingEntry?.createdAt || entry.createdAt || now,
    updatedAt: now,
  });
  const uploadedAttachments = [];
  const uploadedBy = currentUser.fullName ||
    sanitized.creatorName ||
    sanitized.employeeName ||
    sanitized.employeeCode ||
    "Người dùng nội bộ";

  let savedEntry;
  let usingLocalDiaryApi = false;
  try {
    savedEntry = editingEntry
      ? await diaryApi.update(sanitized)
      : await diaryApi.create(sanitized);
  } catch (error) {
    if (!isApiUnavailableError(error)) throw error;
    console.warn(
      "[TimeKeeping data] Diary API unavailable, saving to localStorage cache.",
      {
        endpoint: error.endpoint,
        status: error.status,
        message: error.message,
      },
    );
    savedEntry = sanitized;
    usingLocalDiaryApi = true;
  }

  try {
    if (!usingLocalDiaryApi) {
      for (const file of newFiles) {
        uploadedAttachments.push(await uploadDiaryAttachment({
          diaryEntryId: savedEntry.id,
          file,
          uploadedBy,
          branch: savedEntry.branch,
        }));
      }
    }
    const removableIds = removedAttachmentIds.filter((id) => {
      const attachment = attachments.find((item) => item.id === id);
      return canModifyAttachment(currentUser, attachment);
    });
    if (!usingLocalDiaryApi) {
      await Promise.all(removableIds.map(deleteDiaryAttachment));
    }
    return {
      removableIds,
      savedEntry,
      uploadedAttachments,
      usingLocalDiaryApi,
    };
  } catch (error) {
    await Promise.allSettled(
      uploadedAttachments.map(({ id }) => deleteDiaryAttachment(id)),
    );
    throw error;
  }
}

/** Bulk-delete Diary qua API, fallback local chỉ khi endpoint dev không sẵn sàng. */
export async function requestDeleteDiaryIds(ids) {
  try {
    const result = await diaryApi.removeMany(ids);
    const refreshedEntries = await diaryApi.list();
    return { ...result, refreshedEntries };
  } catch (error) {
    if (!isApiUnavailableError(error)) throw error;
    console.warn(
      "[TimeKeeping data] Diary bulk delete API unavailable, deleting from localStorage cache.",
      {
        endpoint: error.endpoint,
        status: error.status,
        message: error.message,
      },
    );
    return { deletedCount: ids.length, deletedIds: ids, localOnly: true };
  }
}
