import { downloadProcessedFile } from "../../excel/excelProcessor";
import {
  formatFileSize,
  PROCESS_STATUS_LABELS,
} from "../../utils/processFileUtils";
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  TrashIcon,
} from "../Icons";

export default function ProcessQueuePanel({
  batchError,
  batchWarning,
  exportMode,
  hasActiveFilters,
  isProcessing,
  mergedResult,
  processableFileCount,
  selectedFiles,
  successfulFiles,
  onClear,
  onDownloadAll,
  onProcess,
  onRemove,
}) {
  return (
    <section className="workspace-card process-queue-card" aria-labelledby="process-queue-title">
      <div className="card-heading">
        <div>
          <div className="section-number">02</div>
          <div>
            <h2 id="process-queue-title">Danh sách file</h2>
            <p>Mỗi file được xử lý độc lập; lỗi ở một file không ảnh hưởng các file còn lại.</p>
          </div>
        </div>
        <button className="button button-secondary" type="button" disabled={!selectedFiles.length || isProcessing} onClick={onClear}>
          <TrashIcon size={17} /> Xóa danh sách
        </button>
      </div>

      {batchError && (
        <div className="alert alert-error" role="alert">
          <AlertIcon size={21} />
          <div><strong>Chưa thể xử lý</strong><span>{batchError}</span></div>
        </div>
      )}
      {batchWarning && (
        <div className="alert alert-warning" role="status">
          <AlertIcon size={21} />
          <div><strong>Cần kiểm tra thêm</strong><span>{batchWarning}</span></div>
        </div>
      )}

      <div className="process-file-list">
        {selectedFiles.map((item) => (
          <article className={`process-file-item status-${item.status}`} key={item.id}>
            <div className="process-file-icon"><FileIcon size={23} /></div>
            <div className="process-file-copy">
              <strong title={item.name}>{item.name}</strong>
              <span>{formatFileSize(item.size)}</span>
              {item.errorMessage && <small className="process-file-error">{item.errorMessage}</small>}
              {(item.processedMeta || item.resultFile) && (
                <small>
                  {(item.processedMeta || item.resultFile).totalRows} dòng đã xử lý
                  {(item.processedMeta || item.resultFile).filteredOutRows ? ` · ${(item.processedMeta || item.resultFile).filteredOutRows} dòng không khớp đã bỏ qua` : ""}
                  {(item.processedMeta || item.resultFile).pdfCount ? ` · ${(item.processedMeta || item.resultFile).pdfCount} PDF nhân viên` : ""}
                </small>
              )}
            </div>
            <div className="process-file-status">
              {item.status === "processing" && <span className="spinner process-spinner" />}
              {item.status === "success" && <CheckIcon size={16} />}
              {item.status === "error" && <AlertIcon size={16} />}
              <span>{PROCESS_STATUS_LABELS[item.status]}</span>
            </div>
            <div className="process-file-actions">
              {item.resultFile && (
                <button className="button button-secondary" type="button" onClick={() => downloadProcessedFile(item.resultFile.blob, item.resultFile.fileName)}>
                  <DownloadIcon size={16} /> Tải gói kết quả
                </button>
              )}
              <button className="icon-button" type="button" disabled={isProcessing} title="Xóa file" aria-label={`Xóa ${item.name}`} onClick={() => onRemove(item.id)}>
                <CloseIcon size={18} />
              </button>
            </div>
            {item.status === "processing" && <div className="process-file-progress"><span style={{ width: `${item.progress}%` }} /></div>}
          </article>
        ))}
        {!selectedFiles.length && (
          <div className="process-queue-empty">
            <FileIcon size={30} />
            <strong>Chưa có file trong hàng đợi</strong>
            <span>Chọn một hoặc nhiều file Excel ở khu vực phía trên.</span>
          </div>
        )}
      </div>

      {mergedResult && (
        <div className="process-merged-result" role="status">
          <div className="download-icon"><DownloadIcon size={25} /></div>
          <div>
            <strong>File tổng hợp đã sẵn sàng</strong>
            <span>
              {mergedResult.totalRows} dòng từ {mergedResult.sourceFileCount} file
              {mergedResult.selectedEmployeeCount
                ? ` · ${mergedResult.exportedEmployeeCount}/${mergedResult.selectedEmployeeCount} nhân viên có dữ liệu · ${mergedResult.missingEmployeeCount} không tìm thấy`
                : ` · ${mergedResult.exportedEmployeeCount} nhân viên có dữ liệu`}
              {" "}· Có Excel và PDF nhân viên trong thư mục ZIP
            </span>
            <small>{mergedResult.fileName}{mergedResult.pdfCount ? ` · ${mergedResult.pdfCount} PDF nhân viên` : ""}</small>
          </div>
          <button className="button button-dark" type="button" onClick={() => downloadProcessedFile(mergedResult.blob, mergedResult.fileName)}>
            <DownloadIcon size={17} /> Tải gói tổng hợp
          </button>
        </div>
      )}

      <div className="process-actions">
        <span>
          File gốc luôn được giữ nguyên. {exportMode === "merged"
            ? hasActiveFilters ? "Kết quả tổng hợp chỉ gồm dữ liệu khớp bộ lọc." : "Kết quả tổng hợp gồm dữ liệu từ tất cả file."
            : <>Kết quả riêng tải về dạng <strong>ZIP</strong>, bên trong có file Excel và thư mục PDF nhân viên.</>}
        </span>
        <div>
          {exportMode === "separate" && successfulFiles.length > 1 && (
            <button className="button button-secondary" type="button" disabled={isProcessing} onClick={onDownloadAll}>
              <DownloadIcon size={17} /> Tải tất cả
            </button>
          )}
          <button className="button button-primary" type="button" disabled={!processableFileCount || isProcessing} onClick={onProcess}>
            {isProcessing
              ? <><span className="spinner" /> Đang xử lý hàng đợi...</>
              : exportMode === "merged" ? "Xử lý và xuất file tổng hợp" : "Xử lý từng file"}
          </button>
        </div>
      </div>
    </section>
  );
}
