import {
  DownloadIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from "../Icons";
import { getEmployeeBulkDeleteLabel } from "../../employees/employeeSelection";

export default function EmployeeToolbar({
  allowDelete,
  allowImportExport,
  importInputRef,
  isDeletingSelected,
  isImporting,
  onCreate,
  onDeleteSelected,
  onExport,
  onImport,
  selectedCount,
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
          <button
            className="button button-secondary"
            type="button"
            disabled={isImporting}
            onClick={() => importInputRef.current?.click()}
          >
            <UploadIcon size={18} />
            {isImporting ? "Đang import..." : "Import RegisHours.xlsx"}
          </button>
          <button className="button button-secondary" type="button" onClick={onExport}>
            <DownloadIcon size={18} /> Export Excel
          </button>
        </>
      )}
      <button className="button button-primary" type="button" onClick={onCreate}>
        <PlusIcon size={18} /> Thêm nhân viên
      </button>
      {allowDelete && (
        <button
          className="button button-secondary employee-bulk-delete"
          type="button"
          disabled={!selectedCount || isDeletingSelected}
          onClick={onDeleteSelected}
        >
          <TrashIcon size={18} />
          {getEmployeeBulkDeleteLabel(selectedCount, isDeletingSelected)}
        </button>
      )}
    </div>
  );
}
