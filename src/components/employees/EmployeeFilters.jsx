import { FilterIcon, SearchIcon } from "../Icons";

export default function EmployeeFilters({
  branches,
  branchFilter,
  employeeGroups,
  groupFilter,
  search,
  shiftFilter,
  shifts,
  onBranchChange,
  onGroupChange,
  onSearchChange,
  onShiftChange,
}) {
  return (
    <div className="employee-filters">
      <label className="search-field">
        <SearchIcon size={18} />
        <input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Tìm mã, tên, chi nhánh..."
        />
      </label>
      <label className="select-field">
        <FilterIcon size={17} />
        <select value={branchFilter} onChange={(event) => onBranchChange(event.target.value)}>
          <option value="">Tất cả chi nhánh</option>
          {branches.map((branch) => <option key={branch} value={branch}>{branch}</option>)}
        </select>
      </label>
      <label className="select-field">
        <FilterIcon size={17} />
        <select value={shiftFilter} onChange={(event) => onShiftChange(event.target.value)}>
          <option value="">Tất cả giờ ĐK</option>
          {shifts.map((shift) => <option key={shift} value={shift}>{shift}</option>)}
        </select>
      </label>
      <label className="select-field">
        <FilterIcon size={17} />
        <select value={groupFilter} onChange={(event) => onGroupChange(event.target.value)}>
          <option value="">Tất cả nhóm</option>
          {employeeGroups.map((group) => <option key={group} value={group}>{group}</option>)}
        </select>
      </label>
    </div>
  );
}
