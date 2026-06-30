import { isManager } from "../auth/authorization";
import { useEmployeeFilters } from "../hooks/useEmployeeFilters";
import { useEmployees } from "../hooks/useEmployees";
import EmployeeForm from "./EmployeeForm";
import EmployeeFilters from "./employees/EmployeeFilters";
import EmployeeTable from "./employees/EmployeeTable";
import EmployeeToolbar from "./employees/EmployeeToolbar";
import { AlertIcon, UsersIcon } from "./Icons";

/** Màn hình nhân viên chỉ ghép filter, action hook và các component UI chuyên trách. */
export default function EmployeePage({
  currentUser,
  employees,
  onEmployeesChange,
  onLogAction,
}) {
  const filters = useEmployeeFilters(currentUser, employees);
  const actions = useEmployees({
    allowDelete: filters.allowDelete,
    allowImportExport: filters.allowImportExport,
    currentUser,
    employees,
    onEmployeesChange,
    onLogAction,
    visibleEmployeeIds: filters.visibleEmployeeIds,
  });

  return (
    <main className="employee-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">Dữ liệu nền chấm công</div>
          <h1>Danh sách nhân viên <span>/ Giờ đăng ký</span></h1>
          <p>
            Quản lý khung giờ làm việc để hệ thống tự động đối chiếu đi trễ, về sớm và tổng thời gian làm.
          </p>
        </div>
        <div className="employee-stat">
          <span className="employee-stat-icon"><UsersIcon size={24} /></span>
          <div><strong>{filters.visibleEmployees.length.toLocaleString("vi-VN")}</strong><span>nhân viên đã lưu</span></div>
        </div>
      </section>

      <section className="employee-card">
        <div className="employee-toolbar">
          <EmployeeToolbar
            allowDelete={filters.allowDelete}
            allowImportExport={filters.allowImportExport}
            importInputRef={actions.importInputRef}
            isDeletingSelected={actions.isDeletingSelected}
            isImporting={actions.isImporting}
            onCreate={actions.openCreateForm}
            onDeleteSelected={actions.handleDeleteSelectedEmployees}
            onExport={actions.handleExport}
            onImport={actions.handleImport}
            selectedCount={actions.selectedEmployeeIds.length}
          />
          <EmployeeFilters
            branches={filters.branches}
            branchFilter={filters.branchFilter}
            employeeGroups={filters.employeeGroups}
            groupFilter={filters.groupFilter}
            search={filters.search}
            shiftFilter={filters.shiftFilter}
            shifts={filters.shifts}
            onBranchChange={filters.setBranchFilter}
            onGroupChange={filters.setGroupFilter}
            onSearchChange={filters.setSearch}
            onShiftChange={filters.setShiftFilter}
          />
        </div>

        {actions.message && (
          <div className={`alert ${actions.message.type === "error" ? "alert-error" : "alert-success"}`} role="status">
            <AlertIcon size={20} />
            <div><strong>{actions.message.type === "error" ? "Không thể thực hiện" : "Đã lưu dữ liệu"}</strong><span>{actions.message.text}</span></div>
          </div>
        )}

        <div className="employee-table-meta">
          <span>Hiển thị <strong>{filters.filteredEmployees.length}</strong> / {filters.visibleEmployees.length} nhân viên</span>
          {actions.selectedEmployeeIds.length > 0 && (
            <span className="employee-selection-meta">
              Đã chọn <strong>{actions.selectedEmployeeIds.length}</strong> nhân viên
            </span>
          )}
          <span>{isManager(currentUser) ? `Manager chi nhánh ${currentUser.branch}` : "Dữ liệu được lưu qua API có kiểm tra phân quyền"}</span>
        </div>

        <EmployeeTable
          allowDelete={filters.allowDelete}
          allowImportExport={filters.allowImportExport}
          filteredEmployees={filters.filteredEmployees}
          isDeletingSelected={actions.isDeletingSelected}
          onDelete={actions.deleteEmployee}
          onEdit={actions.openEditForm}
          onSelect={actions.toggleSelectEmployee}
          onSelectAllVisible={actions.toggleSelectAllVisible}
          selectAllCheckboxRef={actions.selectAllCheckboxRef}
          selectedIds={actions.selectedEmployeeIds}
          visibleEmployeeIds={filters.visibleEmployeeIds}
          visibleEmployees={filters.visibleEmployees}
          visibleSelectionState={actions.visibleSelectionState}
        />
      </section>

      {actions.isFormOpen && (
        <EmployeeForm
          employee={actions.editingEmployee}
          fixedBranch={isManager(currentUser) ? currentUser.branch : ""}
          onCancel={actions.closeForm}
          onSave={actions.saveEmployee}
        />
      )}
    </main>
  );
}
