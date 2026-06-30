import { CloseIcon, EyeIcon } from "../Icons";

export default function ResetPasswordModal({
  isSaving,
  resetTarget,
  showPassword,
  value,
  onChange,
  onClose,
  onSubmit,
  onTogglePassword,
}) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={() => !isSaving && onClose()}>
      <div className="employee-modal account-reset-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-heading">
          <div><div className="eyebrow">Đặt lại mật khẩu</div><h2 id="reset-password-title">{resetTarget.username}</h2></div>
          <button className="icon-button" type="button" disabled={isSaving} onClick={onClose} aria-label="Đóng"><CloseIcon /></button>
        </div>
        <form onSubmit={onSubmit}>
          <label className="form-field">
            <span>Mật khẩu mới</span>
            <div className="password-field">
              <input type={showPassword ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoFocus />
              <button type="button" onClick={onTogglePassword}><EyeIcon size={16} /> {showPassword ? "Ẩn" : "Xem"}</button>
            </div>
          </label>
          <div className="modal-actions">
            <button className="button button-secondary" type="button" disabled={isSaving} onClick={onClose}>Hủy</button>
            <button className="button button-primary" type="submit" disabled={isSaving}>{isSaving ? "Đang lưu..." : "Đặt lại"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
