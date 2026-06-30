import { UploadIcon } from "../Icons";

export default function ProcessUploadPanel({
  inputRef,
  isDragging,
  isProcessing,
  onAddFiles,
  onDraggingChange,
}) {
  return (
    <section className="workspace-card process-upload-card" aria-labelledby="process-upload-title">
      <div className="card-heading">
        <div>
          <div className="section-number">01</div>
          <div>
            <h2 id="process-upload-title">Chọn file chấm công</h2>
            <p>Có thể chọn hoặc kéo thả nhiều file Excel cùng lúc.</p>
          </div>
        </div>
      </div>

      <div
        className={`dropzone process-dropzone ${isDragging ? "is-dragging" : ""}`}
        onDragEnter={(event) => {
          event.preventDefault();
          if (!isProcessing) onDraggingChange(true);
        }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) onDraggingChange(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          onDraggingChange(false);
          if (!isProcessing) onAddFiles(event.dataTransfer.files);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          disabled={isProcessing}
          accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
          onChange={(event) => {
            onAddFiles(event.target.files);
            event.target.value = "";
          }}
        />
        <div className="dropzone-icon"><UploadIcon size={32} /></div>
        <p className="dropzone-title">Kéo thả các file Excel vào đây</p>
        <p className="dropzone-caption">Có thể chọn nhiều file Excel cùng lúc</p>
        <button
          className="button button-secondary"
          type="button"
          disabled={isProcessing}
          onClick={() => inputRef.current?.click()}
        >
          <UploadIcon size={17} /> Chọn file Excel
        </button>
        <span className="dropzone-hint">Hỗ trợ .xlsx, .xls · Tối đa 25 MB mỗi file</span>
      </div>
    </section>
  );
}
