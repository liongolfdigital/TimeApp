/** Audit service dùng chung cho controller và các service nghiệp vụ. */
export function createAuditService({
  repository,
  createId,
  nowIso,
  normalizeText,
  toIso,
}) {
  async function logAudit({
    user = null,
    action,
    targetType = "",
    targetId = "",
    detail = null,
  }) {
    await repository.insertAudit({
      id: createId(),
      accountId: user?.id ?? null,
      username: user?.username ?? null,
      role: user?.role ?? null,
      branch: user?.branch ?? null,
      action,
      targetType,
      targetId,
      detail: detail === null || detail === undefined ? null : JSON.stringify(detail),
      createdAt: nowIso(),
    });
  }

  async function logAuditSafely(context, record) {
    try {
      await logAudit(record);
    } catch (error) {
      console.warn(`[${context}] audit failed:`, {
        name: error.name,
        code: error.code,
        message: error.message,
      });
    }
  }

  async function list(limitInput) {
    const limit = Math.min(Math.max(Number(limitInput) || 100, 1), 500);
    const rows = await repository.listAudit(limit);
    return rows.map((row) => ({
      id: row.id,
      accountId: row.user_id,
      username: row.username,
      role: row.role,
      branch: row.branch,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      detail: row.detail === null || row.detail === undefined
        ? null
        : typeof row.detail === "string" ? row.detail : JSON.stringify(row.detail),
      createdAt: toIso(row.created_at),
    }));
  }

  async function recordClientAction(body, user) {
    const action = normalizeText(body?.action);
    if (!action) {
      const error = new Error("Thieu ten thao tac can ghi log.");
      error.status = 400;
      throw error;
    }
    await logAudit({
      user,
      action,
      targetType: normalizeText(body?.targetType),
      targetId: normalizeText(body?.targetId),
      detail: body?.detail ?? null,
    });
  }

  return { list, logAudit, logAuditSafely, recordClientAction };
}
