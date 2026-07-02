import { useShopSummaryProcessing } from "../hooks/useShopSummaryProcessing";
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  DownloadIcon,
  FileIcon,
  StoreIcon,
  TrashIcon,
  UploadIcon,
} from "./Icons";
import {
  formatFileSize,
  PROCESS_STATUS_LABELS,
} from "../utils/processFileUtils";

export default function ShopSummaryPage() {
  const processing = useShopSummaryProcessing();

  return (
    <main className="process-page" id="top">
      <section className="process-hero">
        <div className="eyebrow">Import tổng shop</div>
        <h1>Xử lý - Tổng shop</h1>
        <p>Import nhiều file shop như 2026-06-OL rồi xuất một file tổng hợp theo mẫu ChamCong_Tổng_hợp.</p>
        <div className="process-hero-stats" aria-label="Trạng thái tổng shop">
          <span><strong>{processing.selectedFiles.length}</strong> file đã chọn</span>
          <span><strong>{processing.result?.totalRows ?? 0}</strong> nhân viên tổng hợp</span>
        </div>
      </section>

      <div className="process-layout">
        <section className="workspace-card process-upload-card" aria-labelledby="shop-summary-upload-title">
          <div className="card-heading">
            <div>
              <div className="section-number">01</div>
              <div>
                <h2 id="shop-summary-upload-title">Chọn file shop</h2>
                <p>Có thể chọn nhiều file Excel đã chốt từ từng shop/chi nhánh.</p>
              </div>
            </div>
          </div>

          <div
            className={`dropzone process-dropzone ${processing.isDragging ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              if (!processing.isProcessing) processing.setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) processing.setIsDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              processing.setIsDragging(false);
              if (!processing.isProcessing) processing.addSelectedFiles(event.dataTransfer.files);
            }}
          >
            <input
              ref={processing.inputRef}
              type="file"
              multiple
              disabled={processing.isProcessing}
              accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
              onChange={(event) => {
                processing.addSelectedFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <div className="dropzone-icon"><StoreIcon size={32} /></div>
            <p className="dropzone-title">Kéo thả file tổng shop vào đây</p>
            <p className="dropzone-caption">Ví dụ: 2026-06-OL, 2026-06-Q7, 2026-06-NHC...</p>
            <button
              className="button button-secondary"
              type="button"
              disabled={processing.isProcessing}
              onClick={() => processing.inputRef.current?.click()}
            >
              <UploadIcon size={17} /> Chọn file Excel
            </button>
            <span className="dropzone-hint">Hỗ trợ .xlsx, .xls · Tối đa 25 MB mỗi file</span>
          </div>
        </section>

        <section className="workspace-card process-filter-card" aria-labelledby="shop-summary-rules-title">
          <div className="card-heading">
            <div>
              <div className="section-number"><StoreIcon size={18} /></div>
              <div>
                <h2 id="shop-summary-rules-title">Cách tổng hợp</h2>
                <p>Trang này chỉ cộng số liệu đã có trong file shop, không tính lại công.</p>
              </div>
            </div>
          </div>
          <div className="process-selection-summary" role="status">
            <strong>Output giống mẫu ChamCong_Tổng_hợp</strong>
            <span>Nhóm theo Mã NV + Tên CC + file nguồn. Cộng Ngày công, Tăng ca, Đi trễ, Về sớm, Trừ khác và Phạt.</span>
          </div>
          <div className="process-filter-section">
            <div className="process-filter-label"><strong>Cột xuất ra</strong></div>
            <div className="process-chip-list">
              {["Mã NV", "Tên CC", "Họ và tên", "Chi nhánh (file)", "Ngày công", "Tăng ca", "Đi trễ", "Về sớm", "Trừ khác", "Phút tăng/trừ", "Tiền phạt"].map((label) => (
                <span className="process-chip selected" key={label}>{label}</span>
              ))}
            </div>
          </div>
        </section>
      </div>

      <section className="workspace-card process-queue-card" aria-labelledby="shop-summary-list-title">
        <div className="card-heading">
          <div>
            <div className="section-number">02</div>
            <div>
              <h2 id="shop-summary-list-title">Danh sách file tổng shop</h2>
              <p>Mỗi file có thể chứa một hoặc nhiều sheet. Sheet không đúng mẫu sẽ được bỏ qua.</p>
            </div>
          </div>
          <button className="button button-secondary" type="button" disabled={!processing.selectedFiles.length || processing.isProcessing} onClick={processing.clearQueue}>
            <TrashIcon size={17} /> Xóa danh sách
          </button>
        </div>

        {processing.batchError && (
          <div className="alert alert-error" role="alert">
            <AlertIcon size={21} />
            <div><strong>Chưa thể tổng hợp</strong><span>{processing.batchError}</span></div>
          </div>
        )}

        <div className="process-file-list">
          {processing.selectedFiles.map((item) => (
            <article className={`process-file-item status-${item.status}`} key={item.id}>
              <div className="process-file-icon"><FileIcon size={23} /></div>
              <div className="process-file-copy">
                <strong title={item.name}>{item.name}</strong>
                <span>{formatFileSize(item.size)}</span>
                {item.errorMessage && <small className="process-file-error">{item.errorMessage}</small>}
              </div>
              <div className="process-file-status">
                {item.status === "processing" && <span className="spinner process-spinner" />}
                {item.status === "success" && <CheckIcon size={16} />}
                {item.status === "error" && <AlertIcon size={16} />}
                <span>{PROCESS_STATUS_LABELS[item.status]}</span>
              </div>
              <div className="process-file-actions">
                <button className="icon-button" type="button" disabled={processing.isProcessing} title="Xóa file" aria-label={`Xóa ${item.name}`} onClick={() => processing.removeQueueItem(item.id)}>
                  <CloseIcon size={18} />
                </button>
              </div>
              {item.status === "processing" && <div className="process-file-progress"><span style={{ width: "65%" }} /></div>}
            </article>
          ))}
          {!processing.selectedFiles.length && (
            <div className="process-queue-empty">
              <FileIcon size={30} />
              <strong>Chưa có file tổng shop</strong>
              <span>Chọn các file như 2026-06-OL để tổng hợp.</span>
            </div>
          )}
        </div>

        {processing.result && (
          <div className="process-merged-result" role="status">
            <div className="download-icon"><DownloadIcon size={25} /></div>
            <div>
              <strong>File ChamCong_Tổng_hợp đã sẵn sàng</strong>
              <span>
                {processing.result.totalRows} nhân viên từ {processing.result.sourceFileCount} file · {processing.result.parsedSheetCount} sheet hợp lệ
                {processing.result.skippedSheetCount ? ` · ${processing.result.skippedSheetCount} sheet bỏ qua` : ""}
              </span>
              <small>{processing.result.fileName}</small>
            </div>
            <button className="button button-dark" type="button" onClick={processing.downloadResult}>
              <DownloadIcon size={17} /> Tải file tổng shop
            </button>
          </div>
        )}

        <div className="process-actions">
          <span>File gốc luôn được giữ nguyên. Trang này chỉ tổng hợp số liệu từ file shop đã chốt.</span>
          <div>
            <button className="button button-primary" type="button" disabled={!processing.processableFileCount || processing.isProcessing} onClick={processing.handleProcessFiles}>
              {processing.isProcessing
                ? <><span className="spinner" /> Đang tổng hợp...</>
                : "Import và xuất ChamCong_Tổng_hợp"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
