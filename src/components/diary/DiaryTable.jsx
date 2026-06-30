import {
  DIARY_FIELDS,
  formatDiaryDate,
  formatDiaryViolationTypes,
  hasDiaryAttachments,
  normalizeDiaryViolationTypes,
} from "../../diary/diaryModel";
import {
  BookIcon,
  EditIcon,
  EyeIcon,
  TrashIcon,
} from "../Icons";

function formatAttachmentDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("vi-VN");
}

function ViolationTags({ value, emptyText = "—" }) {
  const types = normalizeDiaryViolationTypes(value);
  if (!types.length) return <span className="empty-cell">{emptyText}</span>;
  return (
    <div className="diary-tag-list">
      {types.map((type) => (
        <span className={`diary-tag ${type === "OFF" ? "diary-tag-off" : ""}`} key={type}>
          {type}
        </span>
      ))}
    </div>
  );
}

function renderCell(entry, field) {
  if (field.type === "date") return formatDiaryDate(entry[field.key]);
  if (field.type === "attachmentStatus") {
    return (
      <span className={`attachment-status ${hasDiaryAttachments(entry) ? "has-files" : "no-files"}`}>
        {hasDiaryAttachments(entry) ? "Có" : "Không"}
      </span>
    );
  }
  if (field.type === "violationTypes") return <ViolationTags value={entry[field.key]} />;
  if (field.type === "attachments") {
    const firstAttachment = entry.attachments[0];
    return firstAttachment ? (
      <div className="attachment-cell">
        <strong>{firstAttachment.fileName}</strong>
        <span>
          {formatAttachmentDate(firstAttachment.uploadedDate)} · {firstAttachment.uploadedBy}
          {entry.attachments.length > 1 ? ` · +${entry.attachments.length - 1} file` : ""}
        </span>
      </div>
    ) : <span className="empty-cell">Chưa có hồ sơ</span>;
  }
  return entry[field.key] || <span className="empty-cell">—</span>;
}

function getCellTitle(entry, field) {
  if (field.type === "attachments") return undefined;
  if (field.type === "violationTypes") {
    return formatDiaryViolationTypes(entry[field.key]);
  }
  return String(entry[field.key] ?? "");
}

export default function DiaryTable({
  allowDeleteEntry,
  allowImportExport,
  filteredEntries,
  isDeletingSelected,
  selectAllCheckboxRef,
  selectedDiaryIds,
  visibleDiaryIds,
  visibleEntries,
  visibleSelectionState,
  onDelete,
  onEdit,
  onOpen,
  onSelect,
  onSelectAll,
}) {
  return (
    <div className="employee-table-shell diary-table-shell">
      <table className="employee-table diary-table">
        <thead><tr>
          {allowDeleteEntry && (
            <th className="diary-selection-column">
              <input
                ref={selectAllCheckboxRef}
                type="checkbox"
                checked={visibleSelectionState.allSelected}
                disabled={!visibleDiaryIds.length || isDeletingSelected}
                onChange={onSelectAll}
                aria-label="Chọn tất cả Diary đang hiển thị"
              />
            </th>
          )}
          <th className="index-column">STT</th>
          {DIARY_FIELDS.map(({ key, label }) => (
            <th className={`diary-cell-${key}`} key={label}>{label}</th>
          ))}
          <th className="actions-column">Thao tác</th>
        </tr></thead>
        <tbody>
          {filteredEntries.length ? filteredEntries.map((entry, index) => (
            <tr className={`diary-clickable-row ${selectedDiaryIds.includes(entry.id) ? "is-selected" : ""}`} key={entry.id} onClick={() => onOpen(entry.id)}>
              {allowDeleteEntry && (
                <td className="diary-selection-column" onClick={(event) => event.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedDiaryIds.includes(entry.id)}
                    disabled={isDeletingSelected}
                    onChange={() => onSelect(entry.id)}
                    aria-label={`Chọn Diary của ${entry.employeeName || entry.employeeCode}`}
                  />
                </td>
              )}
              <td className="index-column">{index + 1}</td>
              {DIARY_FIELDS.map((field) => (
                <td className={`diary-cell-${field.key}`} key={field.key} title={getCellTitle(entry, field)}>
                  {renderCell(entry, field)}
                </td>
              ))}
              <td className="actions-column">
                <div className="row-actions">
                  <button type="button" onClick={(event) => { event.stopPropagation(); onOpen(entry.id); }} aria-label={`Xem ${entry.employeeName}`}><EyeIcon /></button>
                  <button type="button" onClick={(event) => { event.stopPropagation(); onEdit(entry); }} aria-label={`Sửa ${entry.employeeName}`}><EditIcon /></button>
                  {allowDeleteEntry && (
                    <button className="danger-action" type="button" onClick={(event) => { event.stopPropagation(); onDelete(entry); }} aria-label={`Xóa ${entry.employeeName}`}><TrashIcon /></button>
                  )}
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td className="employee-empty" colSpan={DIARY_FIELDS.length + (allowDeleteEntry ? 3 : 2)}>
                <BookIcon size={30} />
                <strong>{visibleEntries.length ? "Không có kết quả phù hợp" : "Chưa có dữ liệu Diary"}</strong>
                <span>{allowImportExport ? "Import Dairy.xlsx hoặc thêm ghi chú mới." : "Bạn chỉ thấy Diary thuộc chi nhánh được phân quyền."}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
