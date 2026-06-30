import { useEffect, useMemo, useState } from "react";
import {
  canDeleteEmployee,
  canImportExport,
  filterEmployeesForUser,
  getRecordBranch,
} from "../auth/authorization";
import {
  getEmployeeGroup,
  normalizeLookup,
} from "../employees/employeeModel";

/** Phân quyền và áp search/filter lên danh sách nhân viên. */
export function useEmployeeFilters(currentUser, employees) {
  const [search, setSearch] = useState("");
  const [branchFilter, setBranchFilter] = useState("");
  const [shiftFilter, setShiftFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  const visibleEmployees = useMemo(
    () => filterEmployeesForUser(employees, currentUser),
    [currentUser, employees],
  );
  const allowImportExport = canImportExport(currentUser);
  const allowDelete = canDeleteEmployee(currentUser);

  const branches = useMemo(
    () => [...new Set(visibleEmployees.map(getRecordBranch).filter(Boolean))].sort(),
    [visibleEmployees],
  );
  const shifts = useMemo(
    () => [...new Set(
      visibleEmployees.map(({ registeredShift }) => registeredShift).filter(Boolean),
    )].sort(),
    [visibleEmployees],
  );
  const employeeGroups = useMemo(
    () => [...new Set(
      visibleEmployees
        .map(({ employeeName }) => getEmployeeGroup(employeeName))
        .filter(Boolean),
    )].sort((a, b) => a.localeCompare(b, "vi")),
    [visibleEmployees],
  );

  const filteredEmployees = useMemo(() => {
    const normalizedSearch = normalizeLookup(search);
    return visibleEmployees.filter((employee) => {
      const branch = getRecordBranch(employee);
      const employeeGroup = getEmployeeGroup(employee.employeeName);
      const matchesSearch = !normalizedSearch ||
        [employee.employeeCode, employee.employeeName, branch, employeeGroup]
          .some((value) => normalizeLookup(value).includes(normalizedSearch));
      return matchesSearch &&
        (!branchFilter || branch === branchFilter) &&
        (!shiftFilter || employee.registeredShift === shiftFilter) &&
        (!groupFilter || employeeGroup === groupFilter);
    });
  }, [branchFilter, groupFilter, search, shiftFilter, visibleEmployees]);

  const visibleEmployeeIds = useMemo(
    () => filteredEmployees.map(({ id }) => id).filter(Boolean),
    [filteredEmployees],
  );

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
  }, [
    currentUser,
    employees.length,
    filteredEmployees.length,
    groupFilter,
    visibleEmployees.length,
  ]);

  return {
    allowDelete,
    allowImportExport,
    branches,
    branchFilter,
    employeeGroups,
    filteredEmployees,
    groupFilter,
    search,
    setBranchFilter,
    setGroupFilter,
    setSearch,
    setShiftFilter,
    shiftFilter,
    shifts,
    visibleEmployeeIds,
    visibleEmployees,
  };
}
