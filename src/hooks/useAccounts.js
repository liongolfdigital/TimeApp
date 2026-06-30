import { useEffect, useMemo, useState } from "react";
import { accountApi } from "../api/accountApi";
import { DEFAULT_BRANCH_CODES } from "../branches/branchModel";

export const EMPTY_ACCOUNT = Object.freeze({
  username: "",
  password: "",
  fullName: "",
  role: "Manager",
  branch: "Q7",
  status: "Active",
});

/** Tải và quản lý CRUD/reset password account cho trang Admin. */
export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [editingAccount, setEditingAccount] = useState(null);
  const [formData, setFormData] = useState(EMPTY_ACCOUNT);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPasswordValue, setResetPasswordValue] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const activeManagers = useMemo(
    () => accounts.filter((account) =>
      account.role === "Manager" && account.status === "Active").length,
    [accounts],
  );
  const branchOptions = DEFAULT_BRANCH_CODES;

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      setAccounts(await accountApi.list());
      setMessage(null);
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const openCreateForm = () => {
    setEditingAccount(null);
    setFormData({ ...EMPTY_ACCOUNT, branch: branchOptions[0] || "Q7" });
    setShowFormPassword(false);
    setIsFormOpen(true);
    setMessage(null);
  };

  const openEditForm = (account) => {
    setEditingAccount(account);
    setFormData({
      username: account.username,
      password: "",
      fullName: account.fullName,
      role: account.role,
      branch: account.role === "Manager" ? account.branch : "",
      status: account.status,
    });
    setShowFormPassword(false);
    setIsFormOpen(true);
    setMessage(null);
  };

  const saveAccount = async (event) => {
    event.preventDefault();
    setIsSaving(true);
    setMessage(null);
    try {
      if (editingAccount) {
        const updated = await accountApi.update({
          ...formData,
          id: editingAccount.id,
        });
        const finalAccount = formData.password
          ? await accountApi.resetPassword(updated.id, formData.password)
          : updated;
        setAccounts((current) => current.map((account) =>
          account.id === finalAccount.id ? finalAccount : account));
      } else {
        const created = await accountApi.create(formData);
        setAccounts((current) => [...current, created]);
      }
      setIsFormOpen(false);
      setEditingAccount(null);
      setMessage({
        type: "success",
        text: "Tài khoản đã được cập nhật.",
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const toggleStatus = async (account) => {
    const status = account.status === "Active" ? "Inactive" : "Active";
    try {
      const updated = await accountApi.update({ ...account, status });
      setAccounts((current) => current.map((item) =>
        item.id === account.id ? updated : item));
      setMessage({
        type: "success",
        text: status === "Active" ? "Đã mở khóa tài khoản." : "Đã khóa tài khoản.",
      });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  const openResetPassword = (account) => {
    setResetTarget(account);
    setResetPasswordValue("");
    setShowResetPassword(false);
    setMessage(null);
  };

  const submitResetPassword = async (event) => {
    event.preventDefault();
    if (!resetTarget) return;
    setIsSaving(true);
    try {
      await accountApi.resetPassword(resetTarget.id, resetPasswordValue);
      setResetTarget(null);
      setResetPasswordValue("");
      setMessage({ type: "success", text: "Đã đặt lại mật khẩu." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    } finally {
      setIsSaving(false);
    }
  };

  const deleteAccount = async (account) => {
    if (!window.confirm(`Xóa tài khoản "${account.username}"?`)) return;
    try {
      await accountApi.remove(account.id);
      setAccounts((current) =>
        current.filter((item) => item.id !== account.id));
      setMessage({ type: "success", text: "Đã xóa tài khoản." });
    } catch (error) {
      setMessage({ type: "error", text: error.message });
    }
  };

  return {
    accounts,
    activeManagers,
    branchOptions,
    closeForm: () => setIsFormOpen(false),
    closeReset: () => setResetTarget(null),
    deleteAccount,
    editingAccount,
    formData,
    isFormOpen,
    isLoading,
    isSaving,
    message,
    openCreateForm,
    openEditForm,
    openResetPassword,
    resetPasswordValue,
    resetTarget,
    saveAccount,
    setFormData,
    setResetPasswordValue,
    setShowFormPassword,
    setShowResetPassword,
    showFormPassword,
    showResetPassword,
    submitResetPassword,
    toggleStatus,
  };
}
