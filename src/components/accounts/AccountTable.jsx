import { EditIcon, TrashIcon, UsersIcon } from "../Icons";

function formatDateTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat("vi-VN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(date);
}

export default function AccountTable({
  accounts,
  isLoading,
  onDelete,
  onEdit,
  onResetPassword,
  onToggleStatus,
}) {
  return (
    <div className="employee-table-shell account-table-shell">
      <table className="employee-table account-table">
        <thead>
          <tr>
            <th>Username</th><th>Họ tên</th><th>Vai trò</th><th>Chi nhánh</th>
            <th>Trạng thái</th><th>Ngày tạo</th><th>Người tạo</th>
            <th className="actions-column">Thao tác</th>
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td className="employee-empty" colSpan={8}>Đang tải danh sách tài khoản...</td></tr>
          ) : accounts.length ? accounts.map((account) => (
            <tr key={account.id}>
              <td>{account.username}</td>
              <td>{account.fullName}</td>
              <td><span className={`role-badge role-${account.role.toLowerCase()}`}>{account.role}</span></td>
              <td>{account.branch || <span className="empty-cell">—</span>}</td>
              <td><span className={`status-badge ${account.status === "Active" ? "active" : "inactive"}`}>{account.status}</span></td>
              <td>{formatDateTime(account.createdAt)}</td>
              <td>{account.createdBy}</td>
              <td className="actions-column account-actions">
                <div className="row-actions">
                  <button type="button" onClick={() => onEdit(account)} aria-label={`Sửa ${account.username}`}><EditIcon /></button>
                  <button type="button" onClick={() => onToggleStatus(account)}>{account.status === "Active" ? "Khóa" : "Mở"}</button>
                  <button type="button" onClick={() => onResetPassword(account)}>Reset</button>
                  <button className="danger-action" type="button" onClick={() => onDelete(account)} aria-label={`Xóa ${account.username}`}><TrashIcon /></button>
                </div>
              </td>
            </tr>
          )) : (
            <tr>
              <td className="employee-empty" colSpan={8}>
                <UsersIcon size={30} />
                <strong>Chưa có tài khoản</strong>
                <span>Thêm tài khoản Admin hoặc Manager để bắt đầu phân quyền.</span>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
