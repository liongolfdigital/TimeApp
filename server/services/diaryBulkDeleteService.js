const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Tạo workflow validate quyền và xóa transaction cho nhiều Diary. */
export function createDiaryBulkDeleteService({
  branchForbiddenError,
  canAccessBranch,
  maxBulkDeleteRows,
  normalizeText,
  repository,
}) {
  function normalizeIds(ids) {
    if (!Array.isArray(ids)) {
      const error = new Error("Body phải có danh sách ids Diary cần xóa.");
      error.status = 400;
      throw error;
    }
    const normalizedIds = [...new Set(ids.map(normalizeText))];
    if (!normalizedIds.length) {
      const error = new Error(
        "Danh sách ids Diary cần xóa không được để trống.",
      );
      error.status = 400;
      throw error;
    }
    if (normalizedIds.some((id) => !UUID_PATTERN.test(id))) {
      const error = new Error("Danh sách ids Diary cần xóa không hợp lệ.");
      error.status = 400;
      throw error;
    }
    if (normalizedIds.length > maxBulkDeleteRows) {
      const error = new Error(
        "Danh sách Diary cần xóa quá lớn, vui lòng chia thành nhiều lần.",
      );
      error.status = 413;
      throw error;
    }
    return normalizedIds;
  }

  return async function deleteDiaryRecords(ids, user) {
    const normalizedIds = normalizeIds(ids);
    return repository.transaction(async (txRepository) => {
      const rows = await txRepository.findManyByIds(normalizedIds);
      if (rows.some((row) => !canAccessBranch(user, row.branch))) {
        throw branchForbiddenError();
      }
      const existingIds = rows.map(({ id }) => id);
      const attachments =
        await txRepository.listAttachmentsByDiaryIds(existingIds);
      const deletedIds = await txRepository.deleteMany(existingIds);
      return {
        deletedCount: deletedIds.length,
        deletedIds,
        attachments,
      };
    });
  };
}
