import { DIARY_NOTE_TYPES } from "../../diary/diaryModel";
import { FilterIcon, SearchIcon } from "../Icons";

export default function DiaryFilters({
  dateFilter,
  employeeFilter,
  employeeOptions,
  monthFilter,
  noteTypeFilters,
  permissionFilter,
  search,
  onDateChange,
  onEmployeeChange,
  onMonthChange,
  onNoteTypeToggle,
  onPermissionChange,
  onSearchChange,
}) {
  return (
    <div className="employee-filters diary-filters">
      <label className="search-field"><SearchIcon size={18} />
        <input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="Tìm mã, tên, ngày, ghi chú..." />
      </label>
      <label className="select-field date-field"><FilterIcon size={17} />
        <input type="date" value={dateFilter} onChange={(event) => onDateChange(event.target.value)} title="Lọc theo ngày" />
      </label>
      <label className="select-field date-field"><FilterIcon size={17} />
        <input type="month" value={monthFilter} onChange={(event) => onMonthChange(event.target.value)} title="Lọc theo tháng" />
      </label>
      <label className="select-field"><FilterIcon size={17} />
        <select value={employeeFilter} onChange={(event) => onEmployeeChange(event.target.value)}>
          <option value="">Tất cả nhân viên</option>
          {employeeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      <label className="select-field"><FilterIcon size={17} />
        <select value={permissionFilter} onChange={(event) => onPermissionChange(event.target.value)}>
          <option value="">Có phép / Không phép</option>
          <option value="Có phép">Có phép</option>
          <option value="Không phép">Không phép</option>
        </select>
      </label>
      <fieldset className="diary-note-type-filter">
        <legend><FilterIcon size={15} /> Loại ghi chú</legend>
        <div>
          {DIARY_NOTE_TYPES.map((type) => (
            <label className={noteTypeFilters.includes(type) ? "selected" : ""} key={type}>
              <input
                type="checkbox"
                checked={noteTypeFilters.includes(type)}
                onChange={() => onNoteTypeToggle(type)}
              />
              <span>{type}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
