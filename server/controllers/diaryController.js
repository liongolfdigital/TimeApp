export function createDiaryController({
  diaryService,
  logAudit,
  normalizeBranch,
  handleApiError,
  removeStoredFile = async () => {},
}) {
  const auditDetail = (entry) => ({
    employeeCode: entry.employeeCode,
    employeeName: entry.employeeName,
    branch: entry.branch,
  });

  return {
    async list(request, response) {
      return response.json(await diaryService.listForUser(request.user));
    },
    async create(request, response) {
      try {
        const entry = await diaryService.save(request.body || {}, request.user);
        await logAudit({ user: request.user, action: "diary.create", targetType: "diary", targetId: entry.id, detail: auditDetail(entry) });
        return response.status(201).json(entry);
      } catch (error) {
        return handleApiError(response, error);
      }
    },
    async update(request, response) {
      const existingRow = await diaryService.findRow(request.params.id);
      if (!existingRow) return response.status(404).json({ error: "Khong tim thay ghi chu." });
      try {
        const entry = await diaryService.save(
          { ...(request.body || {}), id: request.params.id }, request.user, existingRow,
        );
        await logAudit({ user: request.user, action: "diary.update", targetType: "diary", targetId: entry.id, detail: auditDetail(entry) });
        return response.json(entry);
      } catch (error) {
        return handleApiError(response, error);
      }
    },
    async remove(request, response) {
      const existingRow = await diaryService.findRow(request.params.id);
      if (!existingRow) return response.status(404).json({ error: "Khong tim thay ghi chu." });
      const entry = diaryService.serializeRow(existingRow);
      await diaryService.deleteById(request.params.id);
      await logAudit({ user: request.user, action: "diary.delete", targetType: "diary", targetId: entry.id, detail: auditDetail(entry) });
      return response.status(204).end();
    },
    async exportEntries(request, response) {
      return response.json(await diaryService.listForExport(request.user));
    },
    async importEntries(request, response) {
      const entries = request.body?.entries;
      const receivedRows = Array.isArray(entries) ? entries.length : 0;
      const startedAt = Date.now();
      console.info("[Diary import] received rows", receivedRows);
      try {
        const result = await diaryService.importDiaryRecords(entries, request.user);
        await logAudit({
          user: request.user,
          action: "diary.import",
          targetType: "diary",
          detail: {
            receivedRows: result.receivedRows,
            sanitizedRows: result.sanitizedRows,
            upsertedRows: result.upsertedRows,
            insertedRows: result.insertedRows,
            updatedRows: result.updatedRows,
            branch: request.user.role === "Manager" ? normalizeBranch(request.user.branch) : "ALL",
          },
        });
        const totalMs = Date.now() - startedAt;
        console.info("[Diary import] completed", {
          receivedRows: result.receivedRows,
          sanitizedRows: result.sanitizedRows,
          upsertedRows: result.upsertedRows,
          totalMs,
        });
        return response.json({ ...result, totalMs });
      } catch (error) {
        console.error("[Diary import] failed", {
          receivedRows,
          totalMs: Date.now() - startedAt,
          error: error.message,
        });
        return handleApiError(response, error);
      }
    },
    async deleteEntries(request, response) {
      const startedAt = Date.now();
      try {
        const result = await diaryService.deleteDiaryRecords(request.body?.ids, request.user);
        const cleanupResults = await Promise.allSettled(
          result.attachments.map(removeStoredFile),
        );
        const cleanupFailed = cleanupResults.filter(({ status }) => status === "rejected").length;
        if (cleanupFailed) {
          console.error("[Diary bulk delete] attachment cleanup failed", {
            cleanupFailed,
            deletedCount: result.deletedCount,
          });
        }
        try {
          await logAudit({
            user: request.user,
            action: "diary.bulk_delete",
            targetType: "diary",
            detail: {
              ids: result.deletedIds,
              deletedCount: result.deletedCount,
              branch: request.user.role === "Manager"
                ? normalizeBranch(request.user.branch)
                : "ALL",
            },
          });
        } catch (auditError) {
          console.error("[Diary bulk delete] audit failed", {
            deletedCount: result.deletedCount,
            error: auditError.message,
          });
        }
        console.info("[Diary bulk delete] completed", {
          requestedRows: Array.isArray(request.body?.ids) ? request.body.ids.length : 0,
          deletedRows: result.deletedCount,
          totalMs: Date.now() - startedAt,
        });
        return response.json({
          deletedCount: result.deletedCount,
          deletedIds: result.deletedIds,
        });
      } catch (error) {
        console.error("[Diary bulk delete] failed", {
          requestedRows: Array.isArray(request.body?.ids) ? request.body.ids.length : 0,
          totalMs: Date.now() - startedAt,
          error: error.message,
        });
        return handleApiError(response, error);
      }
    },
  };
}
