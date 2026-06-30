import { createAttachmentFileStorage } from "../storage/attachmentFileStorage.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? ""));
}

/** Nghiệp vụ lưu trữ, phân quyền và metadata file Diary. */
export function createAttachmentService({
  repository,
  diaryService,
  auditService,
  canAccessBranch,
  isProduction,
  maxFileSizeMb,
  allowedAttachmentExtensions,
  uploadDirectory,
  normalizeBranch,
  normalizeText,
  normalizeUsername,
  nowIso,
  serializeAttachment,
  createId,
}) {
  const {
    removeStoredFile,
    storeUploadedFile,
  } = createAttachmentFileStorage({ isProduction, uploadDirectory });

  function canAccessAttachment(user, attachment) {
    if (!attachment) return false;
    if (user?.role === "Admin") return true;
    return canAccessBranch(user, attachment.branch);
  }

  function canModifyAttachment(user, attachment) {
    if (!canAccessAttachment(user, attachment)) return false;
    if (user?.role === "Admin") return true;
    return attachment.uploaded_by_account_id === user.id
      || normalizeUsername(attachment.uploaded_by_username)
        === normalizeUsername(user.username);
  }

  function getConfig() {
    return {
      maxFileSizeMb,
      allowedExtensions: Array.from(allowedAttachmentExtensions),
      storage: process.env.BLOB_READ_WRITE_TOKEN
        ? "vercel-blob"
        : isProduction ? "unavailable" : "local",
    };
  }

  async function list(diaryEntryId, user) {
    const rows = await repository.list({
      diaryEntryId,
      branch: user.role === "Manager" ? user.branch : "",
    });
    return rows.map(serializeAttachment);
  }

  async function save({
    diaryEntryId,
    file,
    uploadedBy: uploadedByInput,
    replaceAttachmentId,
    requestedBranch: requestedBranchInput,
    user,
  }) {
    const uploadedBy = normalizeText(uploadedByInput) || user.fullName;
    const requestedBranch = normalizeBranch(requestedBranchInput);
    if (!file || !isUuid(diaryEntryId) || !uploadedBy) {
      const error = new Error("Can co file, ma Diary va nguoi upload.");
      error.status = 400;
      throw error;
    }
    const diaryRow = await diaryService.findRow(diaryEntryId);
    if (!diaryRow) {
      const error = new Error("Khong tim thay ghi chu.");
      error.status = 404;
      throw error;
    }
    if (!canAccessBranch(user, diaryRow.branch)) {
      const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
      error.status = 403;
      throw error;
    }
    if (
      user.role === "Manager"
      && requestedBranch
      && requestedBranch !== normalizeBranch(user.branch)
    ) {
      const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
      error.status = 403;
      throw error;
    }
    const previousAttachment = replaceAttachmentId
      ? await repository.findById(replaceAttachmentId)
      : null;
    if (replaceAttachmentId && previousAttachment?.diary_entry_id !== diaryEntryId) {
      const error = new Error("Khong tim thay file can thay the.");
      error.status = 404;
      throw error;
    }
    if (previousAttachment && !canModifyAttachment(user, previousAttachment)) {
      const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
      error.status = 403;
      throw error;
    }

    const id = previousAttachment?.id || createId();
    const storedFile = await storeUploadedFile(file, id);
    const values = {
      id,
      diaryEntryId,
      fileName: file.originalname,
      fileType: file.mimetype || "application/octet-stream",
      fileSize: file.size,
      blobUrl: storedFile.blobUrl,
      blobPathname: storedFile.blobPathname,
      uploadedBy,
      uploadedByAccountId: user.id,
      uploadedByUsername: user.username,
      uploadedDate: nowIso(),
      branch: previousAttachment?.branch || diaryRow.branch || requestedBranch,
    };
    try {
      if (previousAttachment) await repository.update(values);
      else await repository.insert(values);
    } catch (error) {
      await removeStoredFile({
        blob_url: values.blobUrl,
        blob_pathname: values.blobPathname,
      });
      throw error;
    }
    if (previousAttachment) await removeStoredFile(previousAttachment);
    const savedAttachment = serializeAttachment(await repository.findById(id));
    await auditService.logAudit({
      user,
      action: previousAttachment ? "attachment.replace" : "attachment.upload",
      targetType: "attachment",
      targetId: id,
      detail: {
        diaryEntryId,
        fileName: savedAttachment.fileName,
        branch: savedAttachment.branch,
      },
    });
    return { attachment: savedAttachment, replaced: Boolean(previousAttachment) };
  }

  async function getContent(id, user) {
    const attachment = await repository.findById(id);
    if (!attachment) return null;
    if (!canAccessAttachment(user, attachment)) {
      const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
      error.status = 403;
      throw error;
    }
    return attachment;
  }

  async function remove(id, user) {
    const attachment = await repository.findById(id);
    if (!attachment) return null;
    if (!canModifyAttachment(user, attachment)) {
      const error = new Error("Ban khong co quyen truy cap du lieu chi nhanh nay");
      error.status = 403;
      throw error;
    }
    await repository.deleteById(attachment.id);
    await removeStoredFile(attachment);
    await auditService.logAudit({
      user,
      action: "attachment.delete",
      targetType: "attachment",
      targetId: attachment.id,
      detail: {
        diaryEntryId: attachment.diary_entry_id,
        fileName: attachment.file_name,
        branch: attachment.branch,
      },
    });
    return attachment;
  }

  async function removeAllForDiary(diaryEntryId, user) {
    if (!isUuid(diaryEntryId)) return null;
    const attachments = await repository.listByDiaryEntryId(diaryEntryId);
    await repository.deleteByDiaryEntryId(diaryEntryId);
    await Promise.all(attachments.map(removeStoredFile));
    await auditService.logAudit({
      user,
      action: "diary.attachments.delete_all",
      targetType: "diary",
      targetId: diaryEntryId,
      detail: { attachmentCount: attachments.length },
    });
    return attachments.length;
  }

  return {
    getConfig,
    getContent,
    list,
    remove,
    removeAllForDiary,
    removeStoredFile,
    save,
  };
}
