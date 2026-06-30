import { getDiaryBulkDeleteLabel } from "../../diary/diarySelection";
import {
  DownloadIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "../Icons";

export default function DiaryToolbar({
  allowDeleteEntry,
  allowImportExport,
  importInputRef,
  isDeletingSelected,
  isImporting,
  selectedCount,
  onCreate,
  onDeleteSelected,
  onExport,
  onImport,
}) {
  return (
    <div className="toolbar-actions">
      <input
        ref={importInputRef}
        className="hidden-file-input"
        type="file"
        aria-hidden="true"
        tabIndex={-1}
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        onChange={(event) => onImport(event.target.files?.[0])}
      />
      {allowImportExport && (
        <>
          <button className="button button-secondary" type="button" disabled={isImporting} onClick={() => importInputRef.current?.click()}>
            <UploadIcon size={18} />{isImporting ? "Đang import..." : "Import Diary.xlsx"}
          </button>
          <button className="button button-secondary" type="button" onClick={onExport}>
            <DownloadIcon size={18} /> Export Excel
          </button>
        </>
      )}
      <button className="button button-primary" type="button" onClick={onCreate}>
        <PlusIcon size={18} /> Thêm ghi chú
      </button>
      {allowDeleteEntry && (
        <button
          className="button button-secondary diary-bulk-delete"
          type="button"
          disabled={!selectedCount || isDeletingSelected}
          onClick={onDeleteSelected}
        >
          <TrashIcon size={18} />
          {getDiaryBulkDeleteLabel(selectedCount, isDeletingSelected)}
        </button>
      )}
    </div>
  );
}
