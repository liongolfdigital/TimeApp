import { useEffect, useMemo, useRef, useState } from "react";
import { isApiUnavailableError } from "../api/apiClient";
import { employeeApi } from "../api/employeeApi";
import {
  canManageEmployee,
  isManager,
} from "../auth/authorization";
import {
  exportEmployeesToExcel,
  importEmployeesFromExcel,
} from "../employees/employeeExcel";
import {
  mergeEmployeeLists,
  sanitizeEmployee,
} from "../employees/employeeModel";
import {
  getVisibleEmployeeSelectionState,
  toggleAllVisibleEmployeeSelection,
  toggleEmployeeSelection,
} from "../employees/employeeSelection";

/** CRUD/import/export và selection của trang nhân viên. */
export function useEmployees({
  allowDelete,
  allowImportExport,
  currentUser,
  employees,
  onEmployeesChange,
  onLogAction,
  visibleEmployeeIds,
}) {
  const importInputRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);
  const [editingEmployee, setEditingEmployee] = useState(undefined);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [isImporting, setIsImporting] = useState(false);
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState([]);
  const [isDeletingSelected, setIsDeletingSelected] = useState(false);

  const visibleSelectionState = useMemo(
    () => getVisibleEmployeeSelectionState(
      selectedEmployeeIds,
      visibleEmployeeIds,
    ),
    [selectedEmployeeIds, visibleEmployeeIds],
  );

  useEffect(() => {
    if (selectAllCheckboxRef.current) {
      selectAllCheckboxRef.current.indeterminate =
        visibleSelectionState.someSelected;
    }
  }, [visibleSelectionState.someSelected]);

  useEffect(() => {
    const validIds = new Set(employees.map(({ id }) => id).filter(Boolean));
    setSelectedEmployeeIds((current) => {
      const next = current.filter((id) => validIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [employees]);

  const openCreateForm = () => {
    setEditingEmployee(undefined);
    setIsFormOpen(true);
  };

  const openEditForm = (employee) => {
    setEditingEmployee(employee);
    setIsFormOpen(true);
  };

  const saveEmployee = async (employee) => {
    const scopedEmployee = isManager(currentUser)
      ? { ...employee, branch: currentUser.branch }
      : employee;
    if (!canManageEmployee(currentUser, scopedEmployee)) {
      setMessage({
        type: "error",
        text: "Bạn không có quyền truy cập dữ liệu chi nhánh này",
      });
      return;
    }

    try {
      let savedEmployee;
      try {
        savedEmployee = editingEmployee
          ? await employeeApi.update(scopedEmployee)
          : await employeeApi.create(scopedEmployee);
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn(
          "[TimeKeeping data] Employee API unavailable, saving to localStorage cache.",
          {
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
          },
        );
        savedEmployee = sanitizeEmployee(scopedEmployee);
      }

      const nextEmployees = editingEmployee
        ? employees.map((item) =>
            item.id === savedEmployee.id ? savedEmployee : item)
        : [...employees, savedEmployee];
      onEmployeesChange(nextEmployees);
      setIsFormOpen(false);
      setMessage({ type: "success", text: "Danh sách nhân viên đã được cập nhật." });
      onLogAction?.(
        editingEmployee ? "employee.update.ui" : "employee.create.ui",
        {
          targetType: "employee",
          targetId: savedEmployee.id,
          detail: {
            employeeCode: savedEmployee.employeeCode,
            employeeName: savedEmployee.employeeName,
            branch: savedEmployee.branch,
          },
        },
      );
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
          console.error(
            "[TimeKeeping data] Employee list reload failed after bulk delete.",
            reloadError,
          );
          const deletedSet = new Set(result.deletedIds ?? requestedIds);
          nextEmployees = employees.filter(({ id }) => !deletedSet.has(id));
          reloadWarning = true;
        }
      } catch (error) {
        if (!isApiUnavailableError(error)) throw error;
        console.warn(
          "[TimeKeeping data] Employee bulk delete API unavailable, deleting from localStorage cache.",
          {
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
          },
        );
        result = {
          deletedCount: requestedIds.length,
          deletedIds: requestedIds,
          localOnly: true,
        };
        const deletedSet = new Set(requestedIds);
        nextEmployees = employees.filter(({ id }) => !deletedSet.has(id));
      }

      const deletedIds = Array.isArray(result.deletedIds)
        ? result.deletedIds
        : requestedIds;
      const deletedCount = Number(result.deletedCount) || deletedIds.length;
      const remainingIds = new Set(nextEmployees.map(({ id }) => id));
      onEmployeesChange(nextEmployees);
      setSelectedEmployeeIds((current) =>
        current.filter((id) => remainingIds.has(id)));

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
        console.warn(
          "[TimeKeeping data] Employee delete API unavailable, deleting from localStorage cache.",
          {
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
          },
        );
      }
      onEmployeesChange(employees.filter((item) => item.id !== employee.id));
      setSelectedEmployeeIds((current) =>
        current.filter((id) => id !== employee.id));
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
        console.warn(
          "[TimeKeeping data] Employee bulk API unavailable, importing to localStorage cache.",
          {
            endpoint: error.endpoint,
            status: error.status,
            message: error.message,
          },
        );
        savedEmployees = mergedEmployees;
      }
      onEmployeesChange(savedEmployees);
      setMessage({
        type: "success",
        text: `Đã import ${importedEmployees.length} nhân viên. Danh sách hiện có ${savedEmployees.length} người.`,
      });
      onLogAction?.("employee.import.ui", {
        targetType: "employee",
        detail: {
          importedCount: importedEmployees.length,
          totalCount: savedEmployees.length,
        },
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsImporting(false);
      if (importInputRef.current) importInputRef.current.value = "";
    }
  };

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

  return {
    closeForm: () => setIsFormOpen(false),
    deleteEmployee,
    editingEmployee,
    handleDeleteSelectedEmployees,
    handleExport,
    handleImport,
    importInputRef,
    isDeletingSelected,
    isFormOpen,
    isImporting,
    message,
    openCreateForm,
    openEditForm,
    saveEmployee,
    selectAllCheckboxRef,
    selectedEmployeeIds,
    toggleSelectAllVisible,
    toggleSelectEmployee,
    visibleSelectionState,
  };
}
