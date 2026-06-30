import { createDiaryBulkDeleteService } from "./diaryBulkDeleteService.js";
import { createDiaryImportService } from "./diaryImportService.js";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRecordId(value, createId) {
  const id = String(value ?? "").trim();
  return UUID_PATTERN.test(id) ? id : createId();
}

function removeLegacyReportText(payload = {}) {
  const { bienBan, report, ...safePayload } = payload;
  return safePayload;
}

/** CRUD/list Diary; import và bulk delete được compose từ service chuyên trách. */
export function createDiaryService({
  repository,
  normalizeBranch,
  normalizeText,
  normalizeLookup,
  normalizeEmployeeCode,
  canAccessBranch,
  branchForbiddenError,
  createId,
  nowIso,
  detectRecordBranch,
  findEmployeeForDiary,
  listEmployeesForDiary,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
  getDiaryIdentity,
  sortDiaryEntries,
  serializeDiaryRow,
  maxImportRows = 5000,
  importBatchSize = 300,
  maxBulkDeleteRows = 5000,
}) {
  async function resolveBranch(
    input,
    user,
    existingRow = null,
    { forceManagerBranch = false } = {},
  ) {
    if (existingRow && !canAccessBranch(user, existingRow.branch)) {
      throw branchForbiddenError();
    }
    if (user.role === "Manager" && forceManagerBranch) {
      return normalizeBranch(user.branch);
    }
    const requestedBranch = detectRecordBranch(input);
    const employeeBranch = detectRecordBranch(
      await findEmployeeForDiary(input) || {},
    );
    const resolvedBranch = employeeBranch || requestedBranch;
    if (user.role === "Manager") {
      if (
        resolvedBranch &&
        resolvedBranch !== normalizeBranch(user.branch)
      ) {
        throw branchForbiddenError();
      }
      return normalizeBranch(user.branch);
    }
    return resolvedBranch;
  }

  async function save(input, user, existingRow = null, options = {}) {
    const now = nowIso();
    const id = existingRow?.id || resolveRecordId(input.id, createId);
    const branch = await resolveBranch(input, user, existingRow, options);
    const createdAt =
      existingRow?.created_at || normalizeText(input.createdAt) || now;
    const updatedAt = normalizeText(input.updatedAt) || now;
    const sanitized = sanitizeDiaryEntry({
      ...input,
      id,
      branch,
      createdAt,
      updatedAt,
    });
    const noteTypes = normalizeDiaryViolationTypes(sanitized.noteTypes);
    const payload = removeLegacyReportText({
      ...sanitized,
      attachments: undefined,
      attachedFiles: undefined,
    });
    if (!normalizeText(payload.date)) {
      const error = new Error("Vui long nhap ngay Diary.");
      error.status = 400;
      throw error;
    }
    await repository.upsert({
      id,
      branch,
      employeeCode: normalizeText(payload.employeeCode),
      employeeName: normalizeText(payload.employeeName),
      violationTypes: noteTypes,
      payload,
      createdAt,
      updatedAt,
    });
    return serializeDiaryRow(await repository.findById(id));
  }

  async function listForUser(user) {
    const rows = user.role === "Manager"
      ? await repository.listByBranch(user.branch)
      : await repository.listAll();
    return sortDiaryEntries(rows.map(serializeDiaryRow));
  }

  const importDiaryRecords = createDiaryImportService({
    branchForbiddenError,
    createId,
    detectRecordBranch,
    getDiaryIdentity,
    importBatchSize,
    listEmployeesForDiary,
    maxImportRows,
    normalizeBranch,
    normalizeDiaryViolationTypes,
    normalizeEmployeeCode,
    normalizeLookup,
    normalizeText,
    nowIso,
    removeLegacyReportText,
    repository,
    sanitizeDiaryEntry,
    serializeDiaryRow,
  });
  const deleteDiaryRecords = createDiaryBulkDeleteService({
    branchForbiddenError,
    canAccessBranch,
    maxBulkDeleteRows,
    normalizeText,
    repository,
  });

  return {
    findRow: repository.findById,
    listForUser,
    listForExport: listForUser,
    save,
    deleteById: repository.deleteById,
    serializeRow: serializeDiaryRow,
    importDiaryRecords,
    deleteDiaryRecords,
    rollback: async () => {},
  };
}
