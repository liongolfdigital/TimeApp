import { useMemo, useState } from "react";
import {
  filterDiaryEntriesForUser,
  filterEmployeesForUser,
  getDiaryEntryBranch,
} from "../auth/authorization";
import {
  formatDiaryDate,
  formatDiaryViolationTypes,
  normalizeDiaryDate,
  normalizeDiaryViolationTypes,
  sortDiaryEntries,
} from "../diary/diaryModel";
import { normalizeLookup } from "../employees/employeeModel";

/** Gắn attachment, áp scope quyền và các filter của trang Diary. */
export function useDiaryView({
  attachments,
  currentUser,
  employees,
  entries,
}) {
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [permissionFilter, setPermissionFilter] = useState("");
  const [violationFilter, setViolationFilter] = useState("");

  const visibleEmployees = useMemo(
    () => filterEmployeesForUser(employees, currentUser),
    [currentUser, employees],
  );
  const enrichedEntries = useMemo(() => entries.map((entry) => {
    const entryAttachments = attachments.filter(
      ({ diaryEntryId }) => diaryEntryId === entry.id,
    );
    const branch = getDiaryEntryBranch(entry, employees);
    return {
      ...entry,
      branch: entry.branch || branch,
      attachments: entryAttachments,
      attachedFiles: entryAttachments,
    };
  }), [attachments, employees, entries]);
  const visibleEntries = useMemo(
    () => filterDiaryEntriesForUser(enrichedEntries, employees, currentUser),
    [currentUser, employees, enrichedEntries],
  );

  const employeeOptions = useMemo(() => {
    const options = new Map();
    visibleEntries.forEach((entry) => {
      const key = entry.employeeCode
        ? `code:${normalizeLookup(entry.employeeCode)}`
        : `name:${normalizeLookup(entry.employeeName)}`;
      const label = [entry.employeeCode, entry.employeeName]
        .filter(Boolean)
        .join(" - ");
      if (label && !options.has(key)) options.set(key, label);
    });
    return Array.from(options, ([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "vi"));
  }, [visibleEntries]);

  const filteredEntries = useMemo(() => {
    const term = normalizeLookup(search);
    const matches = visibleEntries.filter((entry) => {
      const employeeKey = entry.employeeCode
        ? `code:${normalizeLookup(entry.employeeCode)}`
        : `name:${normalizeLookup(entry.employeeName)}`;
      const violationTypes = normalizeDiaryViolationTypes(entry.violationTypes);
      const matchesSearch = !term || [
        entry.employeeCode,
        entry.employeeName,
        entry.date,
        formatDiaryDate(entry.date),
        entry.reason,
        entry.bienBan,
        entry.branch,
        formatDiaryViolationTypes(violationTypes),
      ].some((value) => normalizeLookup(value).includes(term));
      return matchesSearch &&
        (!dateFilter || normalizeDiaryDate(entry.date) === dateFilter) &&
        (!monthFilter || normalizeDiaryDate(entry.date).startsWith(monthFilter)) &&
        (!employeeFilter || employeeKey === employeeFilter) &&
        (!permissionFilter || entry.permission === permissionFilter) &&
        (!violationFilter || violationTypes.includes(violationFilter));
    });
    return sortDiaryEntries(matches);
  }, [
    dateFilter,
    employeeFilter,
    monthFilter,
    permissionFilter,
    search,
    violationFilter,
    visibleEntries,
  ]);

  const visibleDiaryIds = useMemo(
    () => filteredEntries.map(({ id }) => id).filter(Boolean),
    [filteredEntries],
  );

  return {
    dateFilter,
    employeeFilter,
    employeeOptions,
    enrichedEntries,
    filteredEntries,
    monthFilter,
    permissionFilter,
    search,
    setDateFilter,
    setEmployeeFilter,
    setMonthFilter,
    setPermissionFilter,
    setSearch,
    setViolationFilter,
    violationFilter,
    visibleDiaryIds,
    visibleEmployees,
    visibleEntries,
  };
}
