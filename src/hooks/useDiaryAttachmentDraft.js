import { useCallback, useEffect, useRef, useState } from "react";
import {
  createDiaryId,
} from "../diary/diaryModel";
import {
  ensureClipboardImageFile,
  getAttachmentContentUrl,
  isPreviewableAttachment,
  validateAttachmentFile,
} from "../diary/attachmentStorage";

/** Quản lý file chờ, file đánh dấu xóa, drop/paste và preview trong DiaryForm. */
export function useDiaryAttachmentDraft({
  attachments,
  canRemoveAttachment,
  isSaving,
  maxFileSizeMb,
  resetToken,
}) {
  const fileInputRef = useRef(null);
  const objectUrlsRef = useRef(new Set());
  const dragDepthRef = useRef(0);
  const [pendingFiles, setPendingFiles] = useState([]);
  const [removedAttachmentIds, setRemovedAttachmentIds] = useState([]);
  const [previewItem, setPreviewItem] = useState(null);
  const [error, setError] = useState("");
  const [attachmentNotice, setAttachmentNotice] = useState("");
  const [isDragActive, setIsDragActive] = useState(false);

  useEffect(() => {
    setPendingFiles([]);
    setRemovedAttachmentIds([]);
    setPreviewItem(null);
    setError("");
    setAttachmentNotice("");
    setIsDragActive(false);
    dragDepthRef.current = 0;
  }, [resetToken]);

  useEffect(() => () => {
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    objectUrlsRef.current.clear();
  }, []);

  const handleAttachmentFiles = useCallback((files, source = "picker") => {
    const selectedFiles = Array.from(files || []);
    if (!selectedFiles.length) return;
    const validationError = selectedFiles
      .map((file) => validateAttachmentFile(file, maxFileSizeMb))
      .find(Boolean);
    if (validationError) {
      setError(validationError);
      setAttachmentNotice("");
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    const additions = selectedFiles.map((file) => {
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.add(previewUrl);
      return {
        id: `pending-${createDiaryId()}`,
        file,
        fileName: file.name,
        fileSize: file.size,
        fileType: file.type,
        previewUrl,
        pending: true,
      };
    });
    setPendingFiles((current) => [...current, ...additions]);
    setError("");
    setAttachmentNotice(
      source === "paste"
        ? "Đã thêm ảnh từ clipboard"
        : source === "drop" ? "Đã thêm file biên bản" : "",
    );
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [maxFileSizeMb]);

  useEffect(() => {
    const handlePaste = (event) => {
      if (isSaving) return;
      const imageFiles = Array.from(event.clipboardData?.items ?? [])
        .filter((item) =>
          item.kind === "file" && item.type.startsWith("image/"))
        .map((item) => ensureClipboardImageFile(item.getAsFile()))
        .filter(Boolean);
      if (!imageFiles.length) return;
      event.preventDefault();
      handleAttachmentFiles(imageFiles, "paste");
    };
    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [handleAttachmentFiles, isSaving]);

  const handleDragEnter = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!Array.from(event.dataTransfer?.types ?? []).includes("Files")) return;
    dragDepthRef.current += 1;
    setIsDragActive(true);
  };
  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  };
  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setIsDragActive(false);
  };
  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    dragDepthRef.current = 0;
    setIsDragActive(false);
    if (!isSaving) handleAttachmentFiles(event.dataTransfer?.files, "drop");
  };

  const removeFile = (item) => {
    setAttachmentNotice("");
    if (item.pending) {
      URL.revokeObjectURL(item.previewUrl);
      objectUrlsRef.current.delete(item.previewUrl);
      setPendingFiles((current) =>
        current.filter(({ id }) => id !== item.id));
    } else {
      if (!canRemoveAttachment(item)) {
        setError("Bạn không có quyền truy cập chức năng này");
        return;
      }
      setRemovedAttachmentIds((current) =>
        [...new Set([...current, item.id])]);
    }
    if (previewItem?.id === item.id) setPreviewItem(null);
  };

  const viewFile = (item) => {
    const url = item.pending
      ? item.previewUrl
      : getAttachmentContentUrl(item.id);
    if (isPreviewableAttachment(item)) {
      setPreviewItem({ ...item, url });
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  };

  return {
    attachmentNotice,
    error,
    fileInputRef,
    handleAttachmentFiles,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
    isDragActive,
    pendingFiles,
    previewItem,
    removeFile,
    removedAttachmentIds,
    setError,
    setPreviewItem,
    viewFile,
    visibleAttachments: [
      ...attachments.filter(({ id }) => !removedAttachmentIds.includes(id)),
      ...pendingFiles,
    ],
  };
}
