import {
  ATTACHMENT_ACCEPT,
  getAttachmentContentUrl,
} from "../../diary/attachmentStorage";
import {
  CloseIcon,
  DownloadIcon,
  EyeIcon,
  FileIcon,
  TrashIcon,
  UploadIcon,
} from "../Icons";

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes)) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatUploadedDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(date);
}

function isImageAttachment(item) {
  return String(item?.fileType ?? item?.file?.type ?? "").startsWith("image/") ||
    /\.(?:jpe?g|png|webp)$/i.test(String(item?.fileName ?? ""));
}

export default function DiaryAttachmentField({
  canRemoveAttachment,
  draft,
  isSaving,
  maxFileSizeMb,
}) {
  return (
    <section className="form-field form-field-wide diary-form-files">
      <span>File đính kèm</span>
      <input
        ref={draft.fileInputRef}
        className="hidden-file-input"
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPT}
        onChange={(event) =>
          draft.handleAttachmentFiles(event.target.files, "picker")}
      />
      <div
        className={`form-file-dropzone ${draft.isDragActive ? "is-drag-active" : ""}`}
        onDragEnter={draft.handleDragEnter}
        onDragOver={draft.handleDragOver}
        onDragLeave={draft.handleDragLeave}
        onDrop={draft.handleDrop}
      >
        <span className="form-file-drop-icon"><UploadIcon size={23} /></span>
        <div className="form-file-drop-copy">
          <strong>{draft.isDragActive ? "Thả file để thêm đính kèm" : "Kéo thả file vào đây, paste ảnh hoặc bấm Chọn file"}</strong>
          <small>Hỗ trợ JPG, JPEG, PNG, WEBP, PDF, DOC, DOCX, XLS, XLSX; tối đa {maxFileSizeMb}MB/file.</small>
        </div>
        <button className="button button-secondary" type="button" disabled={isSaving} onClick={() => draft.fileInputRef.current?.click()}>
          <UploadIcon size={17} /> Chọn file
        </button>
      </div>
      {draft.attachmentNotice && (
        <div className="attachment-feedback" role="status">
          {draft.attachmentNotice}
        </div>
      )}

      <div className="attachment-list form-file-list">
        {draft.visibleAttachments.length ? draft.visibleAttachments.map((item) => (
          <article className="attachment-item" key={item.id}>
            <span className={`attachment-file-icon ${item.pending && isImageAttachment(item) ? "has-thumbnail" : ""}`}>
              {item.pending && isImageAttachment(item)
                ? <img src={item.previewUrl} alt="" />
                : <FileIcon size={22} />}
            </span>
            <div className="attachment-meta">
              <strong title={item.fileName}>{item.fileName}</strong>
              <span>{item.pending ? `Chờ lưu · ${formatFileSize(item.fileSize)}` : `${formatFileSize(item.fileSize)} · ${formatUploadedDate(item.uploadedDate)} · ${item.uploadedBy}`}</span>
            </div>
            <div className="attachment-actions">
              <button type="button" onClick={() => draft.viewFile(item)} title="Xem file" aria-label={`Xem ${item.fileName}`}><EyeIcon /></button>
              <a href={item.pending ? item.previewUrl : getAttachmentContentUrl(item.id, true)} download={item.pending ? item.fileName : undefined} title="Tải xuống" aria-label={`Tải ${item.fileName}`}><DownloadIcon size={17} /></a>
              {(item.pending || canRemoveAttachment(item)) && (
                <button className="danger-action" type="button" onClick={() => draft.removeFile(item)} title="Xóa file" aria-label={`Xóa ${item.fileName}`}><TrashIcon /></button>
              )}
            </div>
          </article>
        )) : (
          <div className="attachment-empty compact">
            <FileIcon size={27} />
            <strong>Chưa chọn file đính kèm</strong>
            <span>Có thể lưu Diary mà không cần file.</span>
          </div>
        )}
      </div>

      {draft.previewItem && (
        <div className="attachment-preview">
          <div>
            <strong>{draft.previewItem.fileName}</strong>
            <button type="button" onClick={() => draft.setPreviewItem(null)} aria-label="Đóng xem trước"><CloseIcon size={16} /></button>
          </div>
          {draft.previewItem.fileType === "application/pdf"
            ? <iframe src={draft.previewItem.url} title={draft.previewItem.fileName} />
            : <img src={draft.previewItem.url} alt={draft.previewItem.fileName} />}
        </div>
      )}
    </section>
  );
}
