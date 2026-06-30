import { useAttendanceProcessing } from "../hooks/useAttendanceProcessing";
import ProcessFiltersPanel from "./process/ProcessFiltersPanel";
import ProcessQueuePanel from "./process/ProcessQueuePanel";
import ProcessUploadPanel from "./process/ProcessUploadPanel";

/** Trang xử lý hàng loạt; state/pipeline nằm trong hook, các panel chỉ render UI. */
export default function ProcessPage({ employees, diaryEntries, shiftRules }) {
  const processing = useAttendanceProcessing({
    employees,
    diaryEntries,
    shiftRules,
  });

  return (
    <main className="process-page" id="top">
      <section className="process-hero">
        <div className="eyebrow">Công cụ hàng loạt</div>
        <h1>Xử lý</h1>
        <p>Tải lên một hoặc nhiều file chấm công để xử lý hàng loạt.</p>
        <div className="process-hero-stats" aria-label="Trạng thái hàng đợi">
          <span><strong>{processing.selectedFiles.length}</strong> file trong hàng đợi</span>
          <span><strong>{processing.completedCount}</strong> file đã hoàn tất</span>
        </div>
      </section>

      <div className="process-layout">
        <ProcessUploadPanel
          inputRef={processing.inputRef}
          isDragging={processing.isDragging}
          isProcessing={processing.isProcessing}
          onAddFiles={processing.addSelectedFiles}
          onDraggingChange={processing.setIsDragging}
        />
        <ProcessFiltersPanel
          branchOptions={processing.branchOptions}
          employeeSearch={processing.employeeSearch}
          exportMode={processing.exportMode}
          isProcessing={processing.isProcessing}
          processFilters={processing.processFilters}
          selectedEmployeeBranches={processing.selectedEmployeeBranches}
          selectedFileCount={processing.selectedFiles.length}
          visibleEmployees={processing.visibleEmployees}
          onEmployeeSearchChange={processing.setEmployeeSearch}
          onExportModeChange={processing.handleExportModeChange}
          onFilterToggle={processing.toggleFilterValue}
          onFiltersChange={processing.updateProcessFilters}
        />
      </div>

      <ProcessQueuePanel
        batchError={processing.batchError}
        batchWarning={processing.batchWarning}
        exportMode={processing.exportMode}
        hasActiveFilters={processing.hasActiveFilters}
        isProcessing={processing.isProcessing}
        mergedResult={processing.mergedResult}
        processableFileCount={processing.processableFiles.length}
        selectedFiles={processing.selectedFiles}
        successfulFiles={processing.successfulFiles}
        onClear={processing.clearQueue}
        onDownloadAll={processing.handleDownloadAll}
        onProcess={processing.handleProcessAllFiles}
        onRemove={processing.removeQueueItem}
      />
    </main>
  );
}
