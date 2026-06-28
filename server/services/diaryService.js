const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveRecordId(value, createId) {
  const id = String(value ?? "").trim();
  return UUID_PATTERN.test(id) ? id : createId();
}

function removeLegacyReportText(payload = {}) {
  const { bienBan, report, ...safePayload } = payload;
  return safePayload;
}

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
}) {
  async function resolveBranch(input, user, existingRow = null, { forceManagerBranch = false } = {}) {
    if (existingRow && !canAccessBranch(user, existingRow.branch)) throw branchForbiddenError();
    if (user.role === "Manager" && forceManagerBranch) return normalizeBranch(user.branch);
    const requestedBranch = detectRecordBranch(input);
    const employeeBranch = detectRecordBranch(await findEmployeeForDiary(input));
    const resolvedBranch = employeeBranch || requestedBranch;
    if (user.role === "Manager") {
      if (resolvedBranch && resolvedBranch !== normalizeBranch(user.branch)) throw branchForbiddenError();
      return normalizeBranch(user.branch);
    }
    return resolvedBranch;
  }

  async function saveWithRepository(activeRepository, input, user, existingRow = null, options = {}) {
    const now = nowIso();
    const id = existingRow?.id || resolveRecordId(input.id, createId);
    const branch = await resolveBranch(input, user, existingRow, options);
    const createdAt = existingRow?.created_at || normalizeText(input.createdAt) || now;
    const updatedAt = normalizeText(input.updatedAt) || now;
    const violationTypes = normalizeDiaryViolationTypes(
      input.violationTypes ?? input.violation_types ?? input.tags,
    );
    const payload = removeLegacyReportText({ ...input, id, branch, violationTypes, createdAt, updatedAt });
    if (!normalizeText(payload.date)) {
      const error = new Error("Vui long nhap ngay Diary.");
      error.status = 400;
      throw error;
    }
    await activeRepository.upsert({
      id,
      branch,
      employeeCode: normalizeText(payload.employeeCode),
      employeeName: normalizeText(payload.employeeName),
      violationTypes,
      payload,
      createdAt,
      updatedAt,
    });
    return serializeDiaryRow(await activeRepository.findById(id));
  }

  async function save(input, user, existingRow = null, options = {}) {
    return saveWithRepository(repository, input, user, existingRow, options);
  }

  async function rowsForUser(activeRepository, user) {
    return user.role === "Manager"
      ? activeRepository.listByBranch(user.branch)
      : activeRepository.listAll();
  }

  async function listForUser(user) {
    const rows = await rowsForUser(repository, user);
    return sortDiaryEntries(rows.map(serializeDiaryRow));
  }

  function createEmployeeIndex(employees) {
    const byCode = new Map();
    const byName = new Map();
    for (const employee of employees) {
      const code = normalizeEmployeeCode(employee.employeeCode);
      const name = normalizeLookup(employee.employeeName);
      if (code && !byCode.has(code)) byCode.set(code, employee);
      if (name && !byName.has(name)) byName.set(name, employee);
    }
    return { byCode, byName };
  }

  function findIndexedEmployee(entry, employeeIndex) {
    const code = normalizeEmployeeCode(entry.employeeCode);
    if (code && employeeIndex.byCode.has(code)) return employeeIndex.byCode.get(code);
    const name = normalizeLookup(entry.employeeName);
    return name ? employeeIndex.byName.get(name) ?? null : null;
  }

  function detectExplicitBranch(entry) {
    return detectRecordBranch({
      branch: entry?.branch,
      chiNhanh: entry?.chiNhanh,
      chi_nhanh: entry?.chi_nhanh,
      store: entry?.store,
      location: entry?.location,
      "Chi nhánh": entry?.["Chi nhánh"],
      "CHI NHÁNH": entry?.["CHI NHÁNH"],
    });
  }

  function resolveImportBranch(entry, user, employeeIndex) {
    const managerImport = user.role === "Manager";
    const managerBranch = normalizeBranch(user.branch);
    const explicitBranch = normalizeBranch(detectExplicitBranch(entry));
    const identityBranch = normalizeBranch(detectRecordBranch({
      employeeCode: entry?.employeeCode,
      employeeName: entry?.employeeName,
    }));
    const employee = findIndexedEmployee(entry, employeeIndex);
    const employeeBranch = normalizeBranch(detectRecordBranch(employee));

    if (managerImport) {
      for (const branch of [explicitBranch, identityBranch, employeeBranch]) {
        if (branch && branch !== managerBranch) throw branchForbiddenError();
      }
      return managerBranch;
    }

    return employeeBranch || explicitBranch || identityBranch;
  }

  function validateImportSize(entries) {
    if (entries.length <= maxImportRows) return;
    const error = new Error("File Diary quá lớn, vui lòng chia nhỏ file để import.");
    error.status = 413;
    throw error;
  }

  function sanitizeImportRows(entries, user, employeeIndex) {
    return entries.map((entry, index) => {
      const branch = resolveImportBranch(entry, user, employeeIndex);
      const sanitized = sanitizeDiaryEntry({ ...entry, branch });
      if (!sanitized.date) {
        const error = new Error(`Dòng Diary ${index + 1} không có ngày hợp lệ.`);
        error.status = 400;
        throw error;
      }
      if (!sanitized.employeeCode && !sanitized.employeeName) {
        const error = new Error(`Dòng Diary ${index + 1} không có mã hoặc tên nhân viên.`);
        error.status = 400;
        throw error;
      }
      return sanitized;
    });
  }

  async function importDiaryRecords(entries, user) {
    validateImportSize(entries);
    const employees = await listEmployeesForDiary();
    const employeeIndex = createEmployeeIndex(employees);
    const sanitizedRows = sanitizeImportRows(entries, user, employeeIndex);
    const uniqueRows = new Map();
    for (const entry of sanitizedRows) uniqueRows.set(getDiaryIdentity(entry), entry);

    const importedRows = [...uniqueRows.values()];
    const dates = [...new Set(importedRows.map(({ date }) => date))];
    const managerBranch = user.role === "Manager" ? normalizeBranch(user.branch) : "";
    const result = await repository.transaction(async (txRepository) => {
      await txRepository.lockForImport();
      const existingRows = await txRepository.listByDates(dates, managerBranch);
      const existingByIdentity = new Map();
      for (const row of existingRows) {
        const entry = serializeDiaryRow(row);
        const identity = getDiaryIdentity(entry);
        if (!existingByIdentity.has(identity)) existingByIdentity.set(identity, row);
      }

      const timestamp = nowIso();
      let insertedRows = 0;
      let updatedRows = 0;
      const records = importedRows.map((entry) => {
        const identity = getDiaryIdentity(entry);
        const existingRow = existingByIdentity.get(identity);
        const existingEntry = existingRow ? serializeDiaryRow(existingRow) : null;
        const id = existingRow?.id || createId();
        const createdAt = existingRow?.created_at || entry.createdAt || timestamp;
        const payload = removeLegacyReportText({
          ...existingEntry,
          ...entry,
          id,
          branch: entry.branch,
          creatorCode: entry.creatorCode || existingEntry?.creatorCode || "",
          creatorName: entry.creatorName || existingEntry?.creatorName || "",
          createdAt,
          updatedAt: timestamp,
        });
        if (existingRow) updatedRows += 1;
        else insertedRows += 1;
        return {
          id,
          branch: entry.branch,
          employeeCode: normalizeText(entry.employeeCode),
          employeeName: normalizeText(entry.employeeName),
          violationTypes: normalizeDiaryViolationTypes(entry.violationTypes),
          payload,
          createdAt,
          updatedAt: timestamp,
        };
      });

      for (let offset = 0; offset < records.length; offset += importBatchSize) {
        await txRepository.upsertMany(records.slice(offset, offset + importBatchSize));
      }
      return { insertedRows, updatedRows };
    });

    return {
      receivedRows: entries.length,
      sanitizedRows: sanitizedRows.length,
      upsertedRows: importedRows.length,
      ...result,
    };
  }

  return {
    findRow: repository.findById,
    listForUser,
    listForExport: listForUser,
    save,
    deleteById: repository.deleteById,
    serializeRow: serializeDiaryRow,
    importDiaryRecords,
    rollback: async () => {},
  };
}
