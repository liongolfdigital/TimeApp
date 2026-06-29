import { useEffect, useMemo, useRef, useState } from "react";
import EmployeeForm from "./EmployeeForm";
import EmployeeFilters from "./employees/EmployeeFilters";
import EmployeeTable from "./employees/EmployeeTable";
import EmployeeToolbar from "./employees/EmployeeToolbar";
import { AlertIcon, UsersIcon } from "./Icons";
import {exportEmployeesToExcel, importEmployeesFromExcel} from "../employees/employeeExcel";
import {getEmployeeGroup, mergeEmployeeLists, normalizeLookup, sanitizeEmployee} from "../employees/employeeModel";
import {
  getVisibleEmployeeSelectionState,
  toggleAllVisibleEmployeeSelection,
  toggleEmployeeSelection,
} from "../employees/employeeSelection";
import { canDeleteEmployee, canImportExport, canManageEmployee, filterEmployeesForUser, getRecordBranch, isManager} from "../auth/authorization";
import { isApiUnavailableError } from "../api/apiClient";
import { employeeApi } from "../api/employeeApi";

/** Màn hình quản lý nhân viên/Giờ ĐK với filter, CRUD, import/export và scope theo chi nhánh. */
export default function EmployeePage({currentUser, employees, onEmployeesChange, onLogAction}) {
  // State filter, modal chỉnh sửa, thông báo và tiến trình import của trang.
  const importInputRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [editingEmployee, setEditingEmployee] = useState(undefined);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  // Chỉ giữ nhân viên thuộc phạm vi user trước khi tạo filter hoặc render.
  const visibleEmployees = useMemo(
    () => filterEmployeesForUser(employees, currentUser),
    [currentUser, employees],
  );
  const allowImportExport = canImportExport(currentUser);
  const allowDelete = canDeleteEmployee(currentUser);

  // Dựng các option filter từ tập nhân viên user được phép xem.
  const branches = useMemo(
    () => [...new Set(visibleEmployees.map(getRecordBranch).filter(Boolean))].sort(),
    [visibleEmployees],
  );
  const shifts = useMemo(
    () => [...new Set(visibleEmployees.map(({ registeredShift }) => registeredShift).filter(Boolean))].sort(),
    [visibleEmployees],
  );
  const employeeGroups = useMemo(
    () => [...new Set(visibleEmployees.map(({ employeeName }) => getEmployeeGroup(employeeName)).filter(Boolean))].sort((a, b) => a.localeCompare(b, "vi")),
    [visibleEmployees],
  );

  // Áp tìm kiếm cùng các filter chi nhánh/Giờ ĐK/nhóm lên danh sách đã phân quyền.
  const filteredEmployees = useMemo(() => {
    const normalizedSearch = normalizeLookup(search);

    return visibleEmployees.filter((employee) => {
      const branch = getRecordBranch(employee);
      const employeeGroup = getEmployeeGroup(employee.employeeName);
      const matchesSearch = !normalizedSearch ||
        [employee.employeeCode, employee.employeeName, branch, employeeGroup].some((value) => normalizeLookup(value).includes(normalizedSearch));
      const matchesBranch = !branchFilter || branch === branchFilter;
      const matchesShift = !shiftFilter || employee.registeredShift === shiftFilter;
      const matchesGroup = !groupFilter || employeeGroup === groupFilter;
      return matchesSearch && matchesBranch && matchesShift && matchesGroup;
    });
  }, [branchFilter, groupFilter, search, shiftFilter, visibleEmployees]);

  const visibleEmployeeIds = useMemo(
    () => filteredEmployees.map(({ id }) => id).filter(Boolean),
    [filteredEmployees],
  );
  const visibleSelectionState = useMemo(
    () => getVisibleEmployeeSelectionState(selectedEmployeeIds, visibleEmployeeIds),
    [selectedEmployeeIds, visibleEmployeeIds],
  );

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate = visibleSelectionState.someSelected;
    }
  }, [visibleSelectionState.someSelected]);

  useEffect(() => {
    const validIds = new Set(employees.map(({ id }) => id).filter(Boolean));
    setSelectedEmployeeIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [employees]);

  // Ghi số lượng sau phân quyền/filter trong development để hỗ trợ audit dữ liệu.
  useEffect(() => {
    if (import.meta.env.DEV) {
      console.debug("[TimeKeeping data] employees:filter", {
        currentUser,
        role: currentUser?.role,
        branch: currentUser?.branch,
        rawEmployees: employees.length,
        visibleEmployees: visibleEmployees.length,
        filteredEmployees: filteredEmployees.length,
        groupFilter,
      });
    }
  }, [currentUser, employees.length, filteredEmployees.length, groupFilter, visibleEmployees.length]);

  // Mở modal ở chế độ tạo mới.
  const openCreateForm = () => {
    setEditingEmployee(undefined);
    setIsFormOpen(true);
  };

  // Mở modal với hồ sơ nhân viên được chọn.
  const openEditForm = (employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  // Kiểm tra scope, gọi API create/update (fallback local), cập nhật parent và ghi audit.
  const saveEmployee = async (employee) => {
    const scopedEmployee = isManager(currentUser)
      ? { ...employee, branch: currentUser.branch } : employee;
    if (!canManageEmployee(currentUser, scopedEmployee)) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập dữ liệu chi nhánh này" });
      return;
    }

    try {
      let savedEmployee;
      try {
        savedEmployee = editingEmployee ? await employeeApi.update(scopedEmployee) : await employeeApi.create(scopedEmployee);
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn("[TimeKeeping data] Employee API unavailable, saving to localStorage cache.", {
          endpoint: error.endpoint,
          status: error.status,
          message: error.message,
        });
        savedEmployee = sanitizeEmployee(scopedEmployee);
      }

      const nextEmployees = editingEmployee
        ? employees.map((item) => (item.id === savedEmployee.id ? savedEmployee : item)) : [...employees, savedEmployee];
      onEmployeesChange(nextEmployees);
      setIsFormOpen(false);
      setMessage({ type: "success", text: "Danh sách nhân viên đã được cập nhật." });
      onLogAction?.(editingEmployee ? "employee.update.ui" : "employee.create.ui", {
        targetType: "employee",
        targetId: savedEmployee.id,
        detail: {
          employeeCode: savedEmployee.employeeCode,
          employeeName: savedEmployee.employeeName,
          branch: savedEmployee.branch,
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const toggleSelectEmployee = (id) => {
    setSelectedEmployeeIds((current) => toggleEmployeeSelection(current, id));
  };

  const toggleSelectAllVisible = () => {
    setSelectedEmployeeIds((current) =>
      toggleAllVisibleEmployeeSelection(current, visibleEmployeeIds));
  };

  const handleDeleteSelectedEmployees = async () => {
    if (!allowDelete || !selectedEmployeeIds.length || isDeletingSelected) return;
    const requestedIds = [...new Set(selectedEmployeeIds.filter(Boolean))];
    if (!requestedIds.length) return;
    if (!window.confirm(
      `Bạn có chắc muốn xóa ${requestedIds.length} nhân viên đã chọn không? Hành động này không thể hoàn tác.`,
    )) return;

    setMessage(null);
    setIsDeletingSelected(true);
    try {
      let result;
      let nextEmployees;
      let reloadWarning = false;
      try {
        result = await employeeApi.removeMany(requestedIds);
        try {
          nextEmployees = await employeeApi.list();
        } catch (reloadError) {
          console.error("[TimeKeeping data] Employee list reload failed after bulk delete.", reloadError);
          const deletedSet = new Set(result.deletedIds ?? requestedIds);
          nextEmployees = employees.filter(({ id }) => !deletedSet.has(id));
          reloadWarning = true;
        }
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn("[TimeKeeping data] Employee bulk delete API unavailable, deleting from localStorage cache.", {
          endpoint: error.endpoint,
          status: error.status,
          message: error.message,
        });
        result = {
          deletedCount: requestedIds.length,
          deletedIds: requestedIds,
          localOnly: true,
        };
        const deletedSet = new Set(requestedIds);
        nextEmployees = employees.filter(({ id }) => !deletedSet.has(id));
      }

      const deletedIds = Array.isArray(result.deletedIds) ? result.deletedIds : requestedIds;
      const deletedCount = Number(result.deletedCount) || deletedIds.length;
      const remainingIds = new Set(nextEmployees.map(({ id }) => id));
      onEmployeesChange(nextEmployees);
      setSelectedEmployeeIds((current) => current.filter((id) => remainingIds.has(id)));

      const failedCount = requestedIds.length - deletedCount;
      if (failedCount > 0) {
        setMessage({
          type: "error",
          text: "Xóa thất bại một số nhân viên. Vui lòng thử lại.",
        });
      } else {
        setSelectedEmployeeIds([]);
        setMessage({
          type: reloadWarning ? "error" : "success",
          text: reloadWarning
            ? `Đã xóa ${deletedCount} nhân viên nhưng chưa thể tải lại danh sách từ máy chủ.`
            : `Đã xóa ${deletedCount} nhân viên.`,
        });
      }
      onLogAction?.("employee.bulk_delete.ui", {
        targetType: "employee",
        detail: { ids: deletedIds, deletedCount, failedCount },
      });
    } catch (error) {
      console.error("[TimeKeeping data] Employee bulk delete failed.", error);
      setMessage({
        type: "error",
        text: error.message || "Xóa thất bại một số nhân viên. Vui lòng thử lại.",
      });
    } finally {
      setIsDeletingSelected(false);
    }
  };

  // Xác nhận và xóa nhân viên khi user có quyền; fallback xóa cache nếu API không có.
  const deleteEmployee = async (employee) => {
    if (!allowDelete) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }

    const displayName = employee.employeeName || employee.employeeCode;
    if (!window.confirm(`Xóa nhân viên "${displayName}" khỏi danh sách?`)) return;

    try {
      try {
        await employeeApi.remove(employee.id);
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn("[TimeKeeping data] Employee delete API unavailable, deleting from localStorage cache.", {
          endpoint: error.endpoint,
          status: error.status,
          message: error.message,
        });
      }
      onEmployeesChange(employees.filter((item) => item.id !== employee.id));
      setSelectedEmployeeIds((current) => current.filter((id) => id !== employee.id));
      setMessage({ type: "success", text: "Đã xóa nhân viên khỏi danh sách." });
      onLogAction?.("employee.delete.ui", {
        targetType: "employee",
        targetId: employee.id,
        detail: {
          employeeCode: employee.employeeCode,
          employeeName: employee.employeeName,
          branch: employee.branch,
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  // Parse RegisHours.xlsx, merge danh sách, bulk-save và báo số bản ghi import.
  const handleImport = async (file) => {
    if (!file) return;
    if (!allowImportExport) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }

    setMessage(null);
    setIsImporting(true);

    try {
      const importedEmployees = await importEmployeesFromExcel(file);
      const mergedEmployees = mergeEmployeeLists(employees, importedEmployees);
      let savedEmployees;
      try {
        savedEmployees = await employeeApi.replaceAll(mergedEmployees);
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn("[TimeKeeping data] Employee bulk API unavailable, importing to localStorage cache.", {
          endpoint: error.endpoint,
          status: error.status,
          message: error.message,
        });
        savedEmployees = mergedEmployees;
      }
      onEmployeesChange(savedEmployees);
      setMessage({
        type: "success",
        text: `Đã import ${importedEmployees.length} nhân viên. Danh sách hiện có ${savedEmployees.length} người.`,
      });
      onLogAction?.("employee.import.ui", {
        targetType: "employee",
        detail: { importedCount: importedEmployees.length, totalCount: savedEmployees.length },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

  // Kiểm tra quyền rồi tạo/tải RegisHours.xlsx và ghi audit export.
  const handleExport = async () => {
    if (!allowImportExport) {
      setMessage({ type: "error", text: "Bạn không có quyền truy cập chức năng này" });
      return;
    }

    setMessage(null);
    try {
      await exportEmployeesToExcel(employees);
      onLogAction?.("employee.export", {
        targetType: "employee",
        detail: { exportedCount: employees.length },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

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
          <div><strong>{visibleEmployees.length.toLocaleString("vi-VN")}</strong><span>nhân viên đã lưu</span></div>
        </div>
      </section>

      <section className="employee-card">
        <div className="employee-toolbar">
          <EmployeeToolbar
            allowDelete={allowDelete}
            allowImportExport={allowImportExport}
            importInputRef={importInputRef}
            isDeletingSelected={isDeletingSelected}
            isImporting={isImporting}
            onCreate={openCreateForm}
            onDeleteSelected={handleDeleteSelectedEmployees}
            onExport={handleExport}
            onImport={handleImport}
            selectedCount={selectedEmployeeIds.length}
          />
          <EmployeeFilters
            branches={branches}
            branchFilter={branchFilter}
            employeeGroups={employeeGroups}
            groupFilter={groupFilter}
            search={search}
            shiftFilter={shiftFilter}
            shifts={shifts}
            onBranchChange={setBranchFilter}
            onGroupChange={setGroupFilter}
            onSearchChange={setSearch}
            onShiftChange={setShiftFilter}
          />
        </div>

        {message && (
          <div className={`alert ${message.type === "error" ? "alert-error" : "alert-success"}`} role="status">
            <AlertIcon size={20} />
            <div><strong>{message.type === "error" ? "Không thể thực hiện" : "Đã lưu dữ liệu"}</strong><span>{message.text}</span></div>
          </div>
        )}

        <div className="employee-table-meta">
          <span>Hiển thị <strong>{filteredEmployees.length}</strong> / {visibleEmployees.length} nhân viên</span>
          {selectedEmployeeIds.length > 0 && (
            <span className="employee-selection-meta">
              Đã chọn <strong>{selectedEmployeeIds.length}</strong> nhân viên
            </span>
          )}
          <span>{isManager(currentUser) ? `Manager chi nhánh ${currentUser.branch}` : "Dữ liệu được lưu qua API có kiểm tra phân quyền"}</span>
        </div>

        <EmployeeTable
          allowDelete={allowDelete}
          allowImportExport={allowImportExport}
          filteredEmployees={filteredEmployees}
          isDeletingSelected={isDeletingSelected}
          onDelete={deleteEmployee}
          onEdit={openEditForm}
          onSelect={toggleSelectEmployee}
          onSelectAllVisible={toggleSelectAllVisible}
          selectAllCheckboxRef={selectAllCheckboxRef}
          selectedIds={selectedEmployeeIds}
          visibleEmployeeIds={visibleEmployeeIds}
          visibleEmployees={visibleEmployees}
          visibleSelectionState={visibleSelectionState}
        />
      </section>

      {isFormOpen && (
        <EmployeeForm
          employee={editingEmployee}
          fixedBranch={isManager(currentUser) ? currentUser.branch : ""}
          onCancel={() => setIsFormOpen(false)}
          onSave={saveEmployee}
        />
      )}
    </main>
  );
}
