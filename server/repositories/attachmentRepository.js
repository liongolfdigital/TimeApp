const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? ""));
}

export function createAttachmentRepository(database) {
  return {
    async findById(id) {
      if (!isUuid(id)) return null;
      const result = await database.query(
        "SELECT * FROM diary_attachments WHERE id = $1",
        [id],
      );
      return result.rows[0] ?? null;
    },
    async list({ diaryEntryId = "", branch = "" } = {}) {
      const clauses = [];
      const values = [];
      if (diaryEntryId) {
        if (!isUuid(diaryEntryId)) return [];
        values.push(diaryEntryId);
        clauses.push(`diary_entry_id = $${values.length}`);
      }
      if (branch) {
        values.push(branch);
        clauses.push(`UPPER(branch) = UPPER($${values.length})`);
      }
      const whereSql = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
      const result = await database.query(`
        SELECT * FROM diary_attachments
        ${whereSql}
        ORDER BY uploaded_date DESC, created_at DESC
      `, values);
      return result.rows;
    },
    async insert(values) {
      await database.query(`
        INSERT INTO diary_attachments (
          id, diary_entry_id, file_name, file_type, file_size,
          blob_url, blob_pathname, uploaded_by, uploaded_by_account_id,
          uploaded_by_username, uploaded_date, branch
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12
        )
      `, [
        values.id,
        values.diaryEntryId,
        values.fileName,
        values.fileType,
        values.fileSize,
        values.blobUrl,
        values.blobPathname,
        values.uploadedBy,
        values.uploadedByAccountId,
        values.uploadedByUsername,
        values.uploadedDate,
        values.branch,
      ]);
    },
    async update(values) {
      await database.query(`
        UPDATE diary_attachments
        SET file_name = $1, file_type = $2, file_size = $3,
            blob_url = $4, blob_pathname = $5, uploaded_by = $6,
            uploaded_by_account_id = $7, uploaded_by_username = $8,
            uploaded_date = $9, branch = $10
        WHERE id = $11
      `, [
        values.fileName,
        values.fileType,
        values.fileSize,
        values.blobUrl,
        values.blobPathname,
        values.uploadedBy,
        values.uploadedByAccountId,
        values.uploadedByUsername,
        values.uploadedDate,
        values.branch,
        values.id,
      ]);
    },
    async deleteById(id) {
      if (!isUuid(id)) return;
      await database.query("DELETE FROM diary_attachments WHERE id = $1", [id]);
    },
    async listByDiaryEntryId(diaryEntryId) {
      if (!isUuid(diaryEntryId)) return [];
      const result = await database.query(
        "SELECT * FROM diary_attachments WHERE diary_entry_id = $1",
        [diaryEntryId],
      );
      return result.rows;
    },
    async deleteByDiaryEntryId(diaryEntryId) {
      if (!isUuid(diaryEntryId)) return;
      await database.query(
        "DELETE FROM diary_attachments WHERE diary_entry_id = $1",
        [diaryEntryId],
      );
    },
  };
}
