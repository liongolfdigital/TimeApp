import { normalizeBranch } from "../../branches/branchModel";
import { getEmployeeFilterKey } from "../../utils/processFileUtils";
import { FilterIcon, SearchIcon } from "../Icons";

export default function ProcessFiltersPanel({
  branchOptions,
  employeeSearch,
  exportMode,
  isProcessing,
  processFilters,
  selectedEmployeeBranches,
  selectedFileCount,
  visibleEmployees,
  onEmployeeSearchChange,
  onExportModeChange,
  onFilterToggle,
  onFiltersChange,
}) {
  return (
    <section className="workspace-card process-filter-card" aria-labelledby="process-filter-title">
      <div className="card-heading">
        <div>
          <div className="section-number"><FilterIcon size={18} /></div>
          <div>
            <h2 id="process-filter-title">Tùy chọn xử lý</h2>
            <p>Không chọn bộ lọc để xử lý toàn bộ dữ liệu như trang hiện tại.</p>
          </div>
        </div>
      </div>

      <div className="process-filter-section">
        <div className="process-filter-label">
          <strong>Chi nhánh</strong>
          <button type="button" onClick={() => onFiltersChange((current) => ({ ...current, branches: [] }))}>Tất cả</button>
        </div>
        <div className="process-chip-list">
          {branchOptions.map((branch) => (
            <label className={`process-chip ${processFilters.branches.includes(branch) ? "selected" : ""}`} key={branch}>
              <input type="checkbox" checked={processFilters.branches.includes(branch)} disabled={isProcessing} onChange={() => onFilterToggle("branches", branch)} />
              {branch}
            </label>
          ))}
          {!branchOptions.length && <span className="process-filter-empty">Chưa có chi nhánh trong Employees.</span>}
        </div>
      </div>

      <div className="process-filter-section">
        <div className="process-filter-label">
          <strong>Nhân viên <small>{processFilters.employeeIds.length ? `(${processFilters.employeeIds.length} đã chọn)` : "(Tất cả)"}</small></strong>
          <button type="button" onClick={() => onFiltersChange((current) => ({ ...current, employeeIds: [] }))}>Tất cả</button>
        </div>
        <label className="process-search">
          <SearchIcon size={17} />
          <input value={employeeSearch} disabled={isProcessing} placeholder="Tìm theo mã hoặc tên nhân viên" onChange={(event) => onEmployeeSearchChange(event.target.value)} />
        </label>
        <div className="process-employee-options">
          {visibleEmployees.map((employee) => {
            const key = getEmployeeFilterKey(employee);
            const checked = processFilters.employeeIds.includes(key);
            return (
              <label className={checked ? "selected" : ""} key={employee.id || `${employee.employeeCode}-${employee.employeeName}`}>
                <input type="checkbox" checked={checked} disabled={isProcessing} onChange={() => onFilterToggle("employeeIds", key)} />
                <span><strong>{employee.employeeCode || "Chưa có mã"}</strong>{employee.employeeName}</span>
                <small>{normalizeBranch(employee.branch) || "—"}</small>
              </label>
            );
          })}
          {!visibleEmployees.length && <span className="process-filter-empty">Không tìm thấy nhân viên phù hợp.</span>}
        </div>
      </div>

      <div className="process-selection-summary" role="status">
        <strong>
          {processFilters.employeeIds.length
            ? `Đã chọn ${processFilters.employeeIds.length} nhân viên thuộc ${selectedEmployeeBranches.length || "chưa rõ"} chi nhánh${selectedEmployeeBranches.length ? `: ${selectedEmployeeBranches.join(", ")}` : ""}`
            : "Chưa chọn nhân viên cụ thể"}
        </strong>
        <span>
          {processFilters.employeeIds.length
            ? `Danh sách chọn được giữ độc lập với ô search. Số file upload: ${selectedFileCount}.`
            : `Nếu không chọn nhân viên, hệ thống xử lý theo chi nhánh/ngày hoặc toàn bộ dữ liệu. Số file upload: ${selectedFileCount}.`}
        </span>
      </div>

      <div className="process-date-grid">
        <label className="form-field">
          <span>Từ ngày</span>
          <input type="date" value={processFilters.dateFrom} disabled={isProcessing} onChange={(event) => onFiltersChange((current) => ({ ...current, dateFrom: event.target.value }))} />
        </label>
        <label className="form-field">
          <span>Đến ngày</span>
          <input type="date" value={processFilters.dateTo} disabled={isProcessing} onChange={(event) => onFiltersChange((current) => ({ ...current, dateTo: event.target.value }))} />
        </label>
      </div>

      <label className="process-only-match">
        <input type="checkbox" checked={exportMode === "merged" || processFilters.onlyMatchingRows} disabled={isProcessing || exportMode === "merged"} onChange={(event) => onFiltersChange((current) => ({ ...current, onlyMatchingRows: event.target.checked }))} />
        <span><strong>Chỉ xuất dòng khớp bộ lọc</strong><small>{exportMode === "merged" ? "Luôn bật khi xuất file tổng hợp." : "Tắt tùy chọn này để xử lý toàn bộ file."}</small></span>
      </label>

      <fieldset className="process-export-mode">
        <legend>Kiểu xuất file</legend>
        <label className={exportMode === "merged" ? "selected" : ""}>
          <input type="radio" name="export-mode" value="merged" checked={exportMode === "merged"} disabled={isProcessing} onChange={() => onExportModeChange("merged")} />
          <span><strong>Xuất 1 file tổng hợp</strong><small>File tổng hợp chỉ chứa dữ liệu khớp bộ lọc đang chọn.</small></span>
        </label>
        <label className={exportMode === "separate" ? "selected" : ""}>
          <input type="radio" name="export-mode" value="separate" checked={exportMode === "separate"} disabled={isProcessing} onChange={() => onExportModeChange("separate")} />
          <span><strong>Xuất từng file riêng</strong><small>Giữ một kết quả riêng cho mỗi file tải lên.</small></span>
        </label>
      </fieldset>
    </section>
  );
}
