import { useAccounts } from "../hooks/useAccounts";
import AccountFormModal from "./accounts/AccountFormModal";
import AccountTable from "./accounts/AccountTable";
import ResetPasswordModal from "./accounts/ResetPasswordModal";
import { AlertIcon, PlusIcon, UsersIcon } from "./Icons";

/** Trang Account chỉ ghép hook quản trị và ba component bảng/modal. */
export default function AccountPage({ currentUser }) {
  const accounts = useAccounts();

  return (
    <main className="employee-page account-page">
      <section className="page-intro">
        <div>
          <div className="eyebrow">Quản trị truy cập</div>
          <h1>Account <span>/ Tài khoản</span></h1>
          <p>Admin quản lý tài khoản đăng nhập, vai trò, chi nhánh và trạng thái sử dụng hệ thống.</p>
        </div>
        <div className="employee-stat">
          <span className="employee-stat-icon"><UsersIcon size={24} /></span>
          <div><strong>{accounts.activeManagers}</strong><span>manager đang hoạt động</span></div>
        </div>
      </section>

      <section className="employee-card">
        <div className="employee-toolbar">
          <div className="toolbar-actions">
            <button className="button button-primary" type="button" onClick={accounts.openCreateForm}>
              <PlusIcon size={18} /> Thêm tài khoản
            </button>
          </div>
        </div>

        {accounts.message && (
          <div className={`alert ${accounts.message.type === "error" ? "alert-error" : "alert-success"}`} role="status">
            <AlertIcon size={20} />
            <div>
              <strong>{accounts.message.type === "error" ? "Không thể thực hiện" : "Đã lưu dữ liệu"}</strong>
              <span>{accounts.message.text}</span>
            </div>
          </div>
        )}

        <div className="employee-table-meta">
          <span>Hiển thị <strong>{accounts.accounts.length}</strong> tài khoản</span>
          <span>Người đăng nhập hiện tại: {currentUser?.username}</span>
        </div>

        <AccountTable
          accounts={accounts.accounts}
          isLoading={accounts.isLoading}
          onDelete={accounts.deleteAccount}
          onEdit={accounts.openEditForm}
          onResetPassword={accounts.openResetPassword}
          onToggleStatus={accounts.toggleStatus}
        />
      </section>

      {accounts.isFormOpen && (
        <AccountFormModal
          branchOptions={accounts.branchOptions}
          editingAccount={accounts.editingAccount}
          formData={accounts.formData}
          isSaving={accounts.isSaving}
          showPassword={accounts.showFormPassword}
          onChange={accounts.setFormData}
          onClose={accounts.closeForm}
          onSubmit={accounts.saveAccount}
          onTogglePassword={() =>
            accounts.setShowFormPassword((current) => !current)}
        />
      )}

      {accounts.resetTarget && (
        <ResetPasswordModal
          isSaving={accounts.isSaving}
          resetTarget={accounts.resetTarget}
          showPassword={accounts.showResetPassword}
          value={accounts.resetPasswordValue}
          onChange={accounts.setResetPasswordValue}
          onClose={accounts.closeReset}
          onSubmit={accounts.submitResetPassword}
          onTogglePassword={() =>
            accounts.setShowResetPassword((current) => !current)}
        />
      )}
    </main>
  );
}
