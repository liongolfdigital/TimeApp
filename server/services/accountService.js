/** Nghiệp vụ quản trị account, tách khỏi HTTP controller. */
export function createAccountService({
  repository,
  authService,
  auditService,
  badRequestError,
  canonicalRole,
  createId,
  normalizeBranch,
  normalizeText,
  normalizeUsername,
  nowIso,
  serializeAccount,
}) {
  function validateRole(value) {
    const role = canonicalRole(value);
    if (!["Admin", "Manager"].includes(role)) {
      throw badRequestError("Vai tro chi duoc la Admin hoac Manager.");
    }
    return role;
  }

  function validateStatus(value) {
    const status = normalizeText(value);
    if (!["Active", "Inactive"].includes(status)) {
      throw badRequestError("Trang thai chi duoc la Active hoac Inactive.");
    }
    return status;
  }

  async function create(input, user) {
    const username = normalizeUsername(input.username);
    const role = validateRole(input.role);
    const status = validateStatus(input.status ?? "Active");
    const branch = role === "Manager" ? normalizeBranch(input.branch) : normalizeText(input.branch);
    if (!username) throw badRequestError("Vui long nhap Username.");
    if (!normalizeText(input.fullName)) throw badRequestError("Vui long nhap Ho ten.");
    if (String(input.password ?? "").length < 6) {
      throw badRequestError("Mat khau phai co it nhat 6 ky tu.");
    }
    if (role === "Manager" && !branch) {
      throw badRequestError("Manager phai duoc gan chi nhanh.");
    }
    const account = {
      id: createId(),
      username,
      passwordHash: authService.hashPassword(input.password),
      fullName: normalizeText(input.fullName),
      role,
      branch,
      status,
      createdAt: nowIso(),
      createdBy: normalizeText(user?.username) || "system",
    };
    await repository.insert(account);
    const serialized = serializeAccount({
      id: account.id,
      username: account.username,
      full_name: account.fullName,
      role: account.role,
      branch: account.branch,
      status: account.status,
      created_at: account.createdAt,
      created_by: account.createdBy,
    });
    await auditService.logAudit({
      user,
      action: "account.create",
      targetType: "account",
      targetId: serialized.id,
      detail: {
        username: serialized.username,
        role: serialized.role,
        branch: serialized.branch,
      },
    });
    return serialized;
  }

  async function list() {
    return (await repository.list()).map(serializeAccount);
  }

  async function update(id, input, user) {
    const account = await repository.findById(id);
    if (!account) return null;
    const role = validateRole(input.role ?? account.role);
    const status = validateStatus(input.status ?? account.status);
    const username = normalizeUsername(input.username ?? account.username);
    const fullName = normalizeText(input.fullName ?? account.full_name);
    const branch = role === "Manager"
      ? normalizeBranch(input.branch ?? account.branch)
      : normalizeText(input.branch ?? "");
    if (!username) throw badRequestError("Vui long nhap Username.");
    if (!fullName) throw badRequestError("Vui long nhap Ho ten.");
    if (role === "Manager" && !branch) {
      throw badRequestError("Manager phai duoc gan chi nhanh.");
    }
    if (
      canonicalRole(account.role) === "Admin"
      && (role !== "Admin" || status !== "Active")
      && await repository.activeAdminCountExcluding(account.id) === 0
    ) {
      throw badRequestError("Khong the khoa hoac doi vai tro Admin hoat dong cuoi cung.");
    }
    if (account.id === user.id && status !== "Active") {
      throw badRequestError("Khong the tu khoa tai khoan dang dang nhap.");
    }
    await repository.update({ id: account.id, username, fullName, role, branch, status });
    const updated = serializeAccount(await repository.findById(account.id));
    await auditService.logAudit({
      user,
      action: "account.update",
      targetType: "account",
      targetId: account.id,
      detail: {
        username: updated.username,
        role: updated.role,
        branch: updated.branch,
        status: updated.status,
      },
    });
    return updated;
  }

  async function resetPassword(id, passwordInput, user) {
    const account = await repository.findById(id);
    if (!account) return null;
    const password = String(passwordInput ?? "");
    if (password.length < 6) throw badRequestError("Mat khau phai co it nhat 6 ky tu.");
    await repository.updatePassword(account.id, authService.hashPassword(password));
    await repository.deleteSessionsByAccount(account.id);
    await auditService.logAudit({
      user,
      action: "account.reset_password",
      targetType: "account",
      targetId: account.id,
      detail: { username: account.username },
    });
    return serializeAccount(await repository.findById(account.id));
  }

  async function remove(id, user) {
    const account = await repository.findById(id);
    if (!account) return null;
    if (account.id === user.id) {
      throw badRequestError("Khong the xoa tai khoan dang dang nhap.");
    }
    if (
      canonicalRole(account.role) === "Admin"
      && await repository.activeAdminCountExcluding(account.id) === 0
    ) {
      throw badRequestError("Khong the xoa Admin hoat dong cuoi cung.");
    }
    await repository.deleteSessionsByAccount(account.id);
    await repository.deleteById(account.id);
    await auditService.logAudit({
      user,
      action: "account.delete",
      targetType: "account",
      targetId: account.id,
      detail: {
        username: account.username,
        role: account.role,
        branch: account.branch,
      },
    });
    return serializeAccount(account);
  }

  return { create, list, remove, resetPassword, update };
}
