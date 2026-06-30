import { useCallback, useMemo, useState } from "react";
import {
  filterDiaryEntriesForUser,
  filterEmployeesForUser,
  getDiaryEntryBranch,
} from "../auth/authorization";
import {
  formatDiaryDate,
  formatDiaryNoteTypes,
  normalizeDiaryDate,
  normalizeDiaryNoteTypes,
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
  const [noteTypeFilters, setNoteTypeFilters] = useState([]);

  const toggleNoteTypeFilter = useCallback((type) => {
    setNoteTypeFilters((current) =>
      current.includes(type)
        ? current.filter((item) => item !== type)
        : [...current, type]);
  }, []);

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
      const noteTypes = normalizeDiaryNoteTypes(entry.noteTypes);
      const matchesSearch = !term || [
        entry.employeeCode,
        entry.employeeName,
        entry.date,
        formatDiaryDate(entry.date),
        entry.note,
        entry.permissionStatus,
        formatDiaryNoteTypes(noteTypes),
        entry.recordMaker,
        entry.branch,
      ].some((value) => normalizeLookup(value).includes(term));
      return matchesSearch &&
        (!dateFilter || normalizeDiaryDate(entry.date) === dateFilter) &&
        (!monthFilter || normalizeDiaryDate(entry.date).startsWith(monthFilter)) &&
        (!employeeFilter || employeeKey === employeeFilter) &&
        (!permissionFilter || entry.permissionStatus === permissionFilter) &&
        (!noteTypeFilters.length || noteTypeFilters.some((type) => noteTypes.includes(type)));
    });
    return sortDiaryEntries(matches);
  }, [
    dateFilter,
    employeeFilter,
    monthFilter,
    noteTypeFilters,
    permissionFilter,
    search,
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
    noteTypeFilters,
    permissionFilter,
    search,
    setDateFilter,
    setEmployeeFilter,
    setMonthFilter,
    setPermissionFilter,
    setSearch,
    toggleNoteTypeFilter,
    visibleDiaryIds,
    visibleEmployees,
    visibleEntries,
  };
}
