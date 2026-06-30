import { CloseIcon, EyeIcon } from "../Icons";

export default function AccountFormModal({
  branchOptions,
  editingAccount,
  formData,
  isSaving,
  showPassword,
  onChange,
  onClose,
  onSubmit,
  onTogglePassword,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !isSaving && onClose()}>
      <div className="employee-modal account-modal" role="dialog" aria-modal="true" aria-labelledby="account-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><div className="eyebrow">Tài khoản đăng nhập</div><h2 id="account-form-title">{editingAccount ? "Cập nhật tài khoản" : "Thêm tài khoản"}</h2></div>
          <button className="icon-button" type="button" disabled={isSaving} onClick={onClose} aria-label="Đóng"><CloseIcon /></button>
        </div>
        <form onSubmit={onSubmit}>
          <div className="account-form-grid">
            <label className="form-field"><span>Username</span><input value={formData.username} onChange={(event) => onChange((current) => ({ ...current, username: event.target.value }))} /></label>
            <label className="form-field">
              <span>{editingAccount ? "Mật khẩu mới (nếu cần)" : "Mật khẩu"}</span>
              <div className="password-field">
                <input type={showPassword ? "text" : "password"} value={formData.password} onChange={(event) => onChange((current) => ({ ...current, password: event.target.value }))} />
                <button type="button" onClick={onTogglePassword}><EyeIcon size={16} /> {showPassword ? "Ẩn" : "Xem"}</button>
              </div>
            </label>
            <label className="form-field form-field-wide"><span>Họ tên</span><input value={formData.fullName} onChange={(event) => onChange((current) => ({ ...current, fullName: event.target.value }))} /></label>
            <label className="form-field"><span>Vai trò</span><select value={formData.role} onChange={(event) => onChange((current) => ({ ...current, role: event.target.value, branch: event.target.value === "Manager" ? current.branch || branchOptions[0] || "Q7" : "" }))}><option value="Admin">Admin</option><option value="Manager">Manager</option></select></label>
            <label className="form-field"><span>Chi nhánh</span><select value={formData.branch} disabled={formData.role !== "Manager"} onChange={(event) => onChange((current) => ({ ...current, branch: event.target.value }))}><option value="">Không áp dụng</option>{branchOptions.map((branch) => <option key={branch} value={branch}>{branch}</option>)}</select></label>
            <label className="form-field"><span>Trạng thái</span><select value={formData.status} onChange={(event) => onChange((current) => ({ ...current, status: event.target.value }))}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></label>
          </div>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>Hủy</button>
            <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Lưu"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
