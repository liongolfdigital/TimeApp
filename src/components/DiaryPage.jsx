import {
  canModifyAttachment,
  isManager,
} from "../auth/authorization";
import { useDiaryActions } from "../hooks/useDiaryActions";
import { useDiaryView } from "../hooks/useDiaryView";
import DiaryDetails from "./DiaryDetails";
import DiaryForm from "./DiaryForm";
import DiaryFilters from "./diary/DiaryFilters";
import DiaryTable from "./diary/DiaryTable";
import DiaryToolbar from "./diary/DiaryToolbar";
import { AlertIcon, BookIcon } from "./Icons";

/** Màn Diary ghép view hook, action hook và các component con. */
export default function DiaryPage({
  currentUser,
  employees,
  entries,
  attachments,
  attachmentConfig,
  attachmentError,
  onEntriesChange,
  onAttachmentsChange,
  onLogAction,
}) {
  const view = useDiaryView({
    attachments,
    currentUser,
    employees,
    entries,
  });
  const actions = useDiaryActions({
    attachments,
    currentUser,
    employees,
    entries,
    filteredEntries: view.filteredEntries,
    onAttachmentsChange,
    onEntriesChange,
    onLogAction,
    visibleDiaryIds: view.visibleDiaryIds,
    visibleEmployees: view.visibleEmployees,
    visibleEntries: view.visibleEntries,
  });

  return (
    <main className="employee-page diary-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">Dữ liệu đối chiếu chấm công</div>
          <h1>Diary <span>/ Ghi chú nhân viên</span></h1>
          <p>Lưu lý do phát sinh và hồ sơ chứng minh trên server để đối chiếu tự động khi xử lý chấm công.</p>
        </div>
        <div className="employee-stat">
          <span className="employee-stat-icon"><BookIcon size={24} /></span>
          <div><strong>{view.visibleEntries.length.toLocaleString("vi-VN")}</strong><span>dòng Diary đã lưu</span></div>
        </div>
      </section>

      <section className="employee-card">
        <div className="employee-toolbar">
          <DiaryToolbar
            allowDeleteEntry={actions.allowDeleteEntry}
            allowImportExport={actions.allowImportExport}
            importInputRef={actions.importInputRef}
            isDeletingSelected={actions.isDeletingSelected}
            isImporting={actions.isImporting}
            selectedCount={actions.selectedDiaryIds.length}
            onCreate={actions.openCreateForm}
            onDeleteSelected={actions.handleDeleteSelectedDiaries}
            onExport={actions.handleExport}
            onImport={actions.handleImport}
          />
          <DiaryFilters
            dateFilter={view.dateFilter}
            employeeFilter={view.employeeFilter}
            employeeOptions={view.employeeOptions}
            monthFilter={view.monthFilter}
            permissionFilter={view.permissionFilter}
            search={view.search}
            violationFilter={view.violationFilter}
            onDateChange={view.setDateFilter}
            onEmployeeChange={view.setEmployeeFilter}
            onMonthChange={view.setMonthFilter}
            onPermissionChange={view.setPermissionFilter}
            onSearchChange={view.setSearch}
            onViolationChange={view.setViolationFilter}
          />
        </div>

        {(actions.message || attachmentError) && (
          <div className={`alert ${(actions.message?.type === "error" || attachmentError) ? "alert-error" : "alert-success"}`} role="status">
            <AlertIcon size={20} />
            <div>
              <strong>{(actions.message?.type === "error" || attachmentError) ? "Không thể thực hiện" : "Đã lưu dữ liệu"}</strong>
              <span>{attachmentError || actions.message?.text}</span>
            </div>
          </div>
        )}

        <div className="employee-table-meta">
          <span>Hiển thị <strong>{view.filteredEntries.length}</strong> / {view.visibleEntries.length} dòng</span>
          {actions.selectedDiaryIds.length > 0 && (
            <span className="diary-selection-meta">
              Đã chọn <strong>{actions.selectedDiaryIds.length}</strong> ghi chú
            </span>
          )}
          <span>{isManager(currentUser) ? `Manager chỉ thao tác dữ liệu Diary thuộc chi nhánh ${currentUser.branch}` : "Ghi chú được lưu qua API có kiểm tra phân quyền"}</span>
        </div>

        <DiaryTable
          allowDeleteEntry={actions.allowDeleteEntry}
          allowImportExport={actions.allowImportExport}
          filteredEntries={view.filteredEntries}
          isDeletingSelected={actions.isDeletingSelected}
          selectAllCheckboxRef={actions.selectAllCheckboxRef}
          selectedDiaryIds={actions.selectedDiaryIds}
          visibleDiaryIds={view.visibleDiaryIds}
          visibleEntries={view.visibleEntries}
          visibleSelectionState={actions.visibleSelectionState}
          onDelete={actions.deleteEntry}
          onEdit={actions.openEditForm}
          onOpen={actions.openDetails}
          onSelect={actions.toggleSelectDiary}
          onSelectAll={actions.toggleSelectAllVisible}
        />
      </section>

      {actions.isFormOpen && (
        <DiaryForm
          entry={actions.editingEntry}
          employees={view.visibleEmployees}
          attachments={actions.editingEntry?.attachments ?? []}
          currentUser={currentUser}
          fixedBranch={isManager(currentUser) ? currentUser.branch : ""}
          canRemoveAttachment={(attachment) =>
            canModifyAttachment(currentUser, attachment)}
          maxFileSizeMb={attachmentConfig.maxFileSizeMb}
          onCancel={actions.closeForm}
          onSave={actions.saveEntry}
        />
      )}
      {actions.selectedEntry && !actions.isFormOpen && (
        <DiaryDetails
          entry={actions.selectedEntry}
          attachments={actions.selectedEntry.attachments}
          currentUser={currentUser}
          canModifyAttachment={(attachment) =>
            canModifyAttachment(currentUser, attachment)}
          maxFileSizeMb={attachmentConfig.maxFileSizeMb}
          onClose={actions.closeDetails}
          onEdit={() => {
            actions.openEditForm(actions.selectedEntry);
            actions.closeDetails();
          }}
          onEntryTouched={() => actions.touchEntry(actions.selectedEntry.id)}
          onAttachmentsChange={(nextEntryAttachments) =>
            onAttachmentsChange([
              ...attachments.filter(
                ({ diaryEntryId }) => diaryEntryId !== actions.selectedEntry.id,
              ),
              ...nextEntryAttachments,
            ])}
        />
      )}
    </main>
  );
}
