const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value) {
  return UUID_PATTERN.test(String(value ?? ""));
}

function text(value) {
  return String(value ?? "").trim();
}

function stripLegacyReportText(payload = {}) {
  const { bienBan, report, ...safePayload } = payload;
  return safePayload;
}

export function createDiaryRepository(database) {
  async function upsertMany(records) {
    if (!records.length) return [];
    const values = records.map(({
      id,
      branch,
      employeeCode,
      employeeName,
      violationTypes,
      payload,
      createdAt,
      updatedAt,
    }) => {
      const safePayload = stripLegacyReportText(payload);
      return {
        id,
        branch: text(branch),
        weekday: text(safePayload.weekday),
        date: text(safePayload.date),
        employee_code: text(employeeCode),
        employee_name: text(employeeName),
        reason: text(safePayload.reason),
        permission: text(safePayload.permission),
        creator_code: text(safePayload.creatorCode),
        creator_name: text(safePayload.creatorName),
        violation_types: violationTypes ?? [],
        payload: safePayload ?? {},
        created_at: createdAt,
        updated_at: updatedAt,
      };
    });
    const result = await database.query(`
      WITH incoming AS (
        SELECT *
        FROM jsonb_to_recordset($1::jsonb) AS incoming_row(
          id uuid,
          branch text,
          weekday text,
          date date,
          employee_code text,
          employee_name text,
          reason text,
          permission text,
          creator_code text,
          creator_name text,
          violation_types jsonb,
          payload jsonb,
          created_at timestamptz,
          updated_at timestamptz
        )
      )
      INSERT INTO diary_entries (
        id, branch, weekday, date, employee_code, employee_name,
        reason, permission, creator_code, creator_name,
        violation_types, payload, created_at, updated_at
      )
      SELECT
        id, branch, weekday, date, employee_code, employee_name,
        reason, permission, creator_code, creator_name,
        violation_types, payload, created_at, updated_at
      FROM incoming
      ON CONFLICT(id) DO UPDATE SET
        branch = excluded.branch,
        weekday = excluded.weekday,
        date = excluded.date,
        employee_code = excluded.employee_code,
        employee_name = excluded.employee_name,
        reason = excluded.reason,
        permission = excluded.permission,
        creator_code = excluded.creator_code,
        creator_name = excluded.creator_name,
        violation_types = excluded.violation_types,
        payload = excluded.payload,
        updated_at = excluded.updated_at
      RETURNING *
    `, [JSON.stringify(values)]);
    return result.rows;
  }

  return {
    async findById(id) {
      if (!isUuid(id)) return null;
      const result = await database.query("SELECT * FROM diary_entries WHERE id = $1", [id]);
      return result.rows[0] ?? null;
    },
    async findManyByIds(ids) {
      if (!ids.length) return [];
      const result = await database.query(
        "SELECT * FROM diary_entries WHERE id = ANY($1::uuid[])",
        [ids],
      );
      return result.rows;
    },
    async listAll() {
      const result = await database.query("SELECT * FROM diary_entries ORDER BY date DESC, updated_at DESC");
      return result.rows;
    },
    async listByBranch(branch) {
      const result = await database.query(
        "SELECT * FROM diary_entries WHERE UPPER(branch) = UPPER($1) ORDER BY date DESC, updated_at DESC",
        [branch],
      );
      return result.rows;
    },
    async listByDates(dates, branch = "") {
      if (!dates.length) return [];
      const result = branch
        ? await database.query(
          `SELECT * FROM diary_entries
           WHERE date = ANY($1::date[]) AND UPPER(branch) = UPPER($2)
           ORDER BY updated_at DESC`,
          [dates, branch],
        )
        : await database.query(
          `SELECT * FROM diary_entries
           WHERE date = ANY($1::date[])
           ORDER BY updated_at DESC`,
          [dates],
        );
      return result.rows;
    },
    async lockForImport() {
      await database.query("LOCK TABLE diary_entries IN SHARE ROW EXCLUSIVE MODE");
    },
    async upsert(record) {
      await upsertMany([record]);
    },
    upsertMany,
    async deleteById(id) {
      if (!isUuid(id)) return;
      await database.query("DELETE FROM diary_entries WHERE id = $1", [id]);
    },
    async listAttachmentsByDiaryIds(ids) {
      if (!ids.length) return [];
      const result = await database.query(
        "SELECT * FROM diary_attachments WHERE diary_entry_id = ANY($1::uuid[])",
        [ids],
      );
      return result.rows;
    },
    async deleteMany(ids) {
      if (!ids.length) return [];
      const result = await database.query(
        "DELETE FROM diary_entries WHERE id = ANY($1::uuid[]) RETURNING id",
        [ids],
      );
      return result.rows.map(({ id }) => id);
    },
    async deleteAll() {
      await database.query("DELETE FROM diary_entries");
    },
    async deleteBranch(branch) {
      await database.query("DELETE FROM diary_entries WHERE UPPER(branch) = UPPER($1)", [branch]);
    },
    transaction(callback) {
      return database.transaction((tx) => callback(createDiaryRepository(tx)));
    },
  };
}
