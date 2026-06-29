import { EditIcon, TrashIcon, UsersIcon } from "../Icons";
import { EMPLOYEE_FIELDS } from "../../employees/employeeModel";

export default function EmployeeTable({
  allowDelete,
  allowImportExport,
  filteredEmployees,
  isDeletingSelected,
  onDelete,
  onEdit,
  onSelect,
  onSelectAllVisible,
  selectAllCheckboxRef,
  selectedIds,
  visibleEmployeeIds,
  visibleEmployees,
  visibleSelectionState,
}) {
  return (
    <div className="employee-table-shell">
      <table className={`employee-table ${allowDelete ? "employee-table-selectable" : ""}`}>
        <thead>
          <tr>
            {allowDelete && (
              <th className="employee-selection-column">
                <input
                  ref={selectAllCheckboxRef}
                  type="checkbox"
                  checked={visibleSelectionState.allSelected}
                  aria-checked={visibleSelectionState.someSelected ? "mixed" : visibleSelectionState.allSelected}
                  disabled={!visibleEmployeeIds.length || isDeletingSelected}
                  onChange={onSelectAllVisible}
                  aria-label="Chọn tất cả nhân viên đang hiển thị"
                />
              </th>
            )}
            <th className="index-column">STT</th>
            {EMPLOYEE_FIELDS.map(({ label }) => <th key={label}>{label}</th>)}
            <th className="actions-column">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {filteredEmployees.length > 0 ? (
            filteredEmployees.map((employee, index) => (
              <tr className={selectedIds.includes(employee.id) ? "is-selected" : ""} key={employee.id}>
                {allowDelete && (
                  <td className="employee-selection-column">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(employee.id)}
                      disabled={isDeletingSelected}
                      onChange={() => onSelect(employee.id)}
                      aria-label={`Chọn ${employee.employeeName || employee.employeeCode}`}
                    />
                  </td>
                )}
                <td className="index-column">{index + 1}</td>
                {EMPLOYEE_FIELDS.map(({ key }) => (
                  <td key={key} title={employee[key]}>
                    {employee[key] || <span className="empty-cell">—</span>}
                  </td>
                ))}
                <td className="actions-column">
                  <div className="row-actions">
                    <button type="button" onClick={() => onEdit(employee)} aria-label={`Sửa ${employee.employeeName}`}>
                      <EditIcon />
                    </button>
                    {allowDelete && (
                      <button className="danger-action" type="button" onClick={() => onDelete(employee)} aria-label={`Xóa ${employee.employeeName}`}>
                        <TrashIcon />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td className="employee-empty" colSpan={EMPLOYEE_FIELDS.length + (allowDelete ? 3 : 2)}>
                <UsersIcon size={30} />
                <strong>{visibleEmployees.length ? "Không có kết quả phù hợp" : "Chưa có danh sách nhân viên"}</strong>
                <span>{allowImportExport ? "Import file RegisHours.xlsx hoặc thêm nhân viên mới." : "Bạn chỉ thấy nhân viên thuộc chi nhánh được phân quyền."}</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
