function detectExplicitBranch(entry, detectRecordBranch) {
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

/** Tạo workflow validate/scope/upsert batch cho Diary import. */
export function createDiaryImportService({
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
}) {
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
    if (code && employeeIndex.byCode.has(code)) {
      return employeeIndex.byCode.get(code);
    }
    const name = normalizeLookup(entry.employeeName);
    return name ? employeeIndex.byName.get(name) ?? null : null;
  }

  function resolveImportBranch(entry, user, employeeIndex) {
    const managerImport = user.role === "Manager";
    const managerBranch = normalizeBranch(user.branch);
    const explicitBranch = normalizeBranch(
      detectExplicitBranch(entry, detectRecordBranch),
    );
    const identityBranch = normalizeBranch(detectRecordBranch({
      employeeCode: entry?.employeeCode,
      employeeName: entry?.employeeName,
    }));
    const employee = findIndexedEmployee(entry, employeeIndex);
    const employeeBranch = normalizeBranch(detectRecordBranch(employee || {}));

    if (managerImport) {
      for (const branch of [explicitBranch, identityBranch, employeeBranch]) {
        if (branch && branch !== managerBranch) throw branchForbiddenError();
      }
      return managerBranch;
    }
    return employeeBranch || explicitBranch || identityBranch;
  }

  function validateImportSize(entries) {
    if (!Array.isArray(entries)) {
      const error = new Error("Body phải có danh sách entries Diary để import.");
      error.status = 400;
      throw error;
    }
    if (!entries.length) {
      const error = new Error("Danh sách Diary import không được để trống.");
      error.status = 400;
      throw error;
    }
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
        const error = new Error(
          `Dòng Diary ${index + 1} không có mã hoặc tên nhân viên.`,
        );
        error.status = 400;
        throw error;
      }
      return sanitized;
    });
  }

  return async function importDiaryRecords(entries, user) {
    validateImportSize(entries);
    const employees = await listEmployeesForDiary();
    const employeeIndex = createEmployeeIndex(employees);
    const sanitizedRows = sanitizeImportRows(entries, user, employeeIndex);
    const uniqueRows = new Map();
    for (const entry of sanitizedRows) {
      uniqueRows.set(getDiaryIdentity(entry), entry);
    }

    const importedRows = [...uniqueRows.values()];
    const dates = [...new Set(importedRows.map(({ date }) => date))];
    const managerBranch =
      user.role === "Manager" ? normalizeBranch(user.branch) : "";
    const result = await repository.transaction(async (txRepository) => {
      await txRepository.lockForImport();
      const existingRows = await txRepository.listByDates(dates, managerBranch);
      const existingByIdentity = new Map();
      for (const row of existingRows) {
        const entry = serializeDiaryRow(row);
        const identity = getDiaryIdentity(entry);
        if (!existingByIdentity.has(identity)) {
          existingByIdentity.set(identity, row);
        }
      }

      const timestamp = nowIso();
      let insertedRows = 0;
      let updatedRows = 0;
      const records = importedRows.map((entry) => {
        const identity = getDiaryIdentity(entry);
        const existingRow = existingByIdentity.get(identity);
        const existingEntry = existingRow ? serializeDiaryRow(existingRow) : null;
        const id = existingRow?.id || createId();
        const createdAt =
          existingRow?.created_at || entry.createdAt || timestamp;
        const permissionStatus =
          entry.permissionStatus || existingEntry?.permissionStatus || "";
        const recordMaker =
          entry.recordMaker || existingEntry?.recordMaker || "";
        const noteTypes = entry.noteTypes?.length
          ? entry.noteTypes
          : existingEntry?.noteTypes ?? existingEntry?.violationTypes ?? [];
        const payload = removeLegacyReportText({
          ...existingEntry,
          ...entry,
          id,
          branch: entry.branch,
          permissionStatus,
          permission: permissionStatus,
          recordMaker,
          creatorName: recordMaker,
          creatorCode: entry.creatorCode || existingEntry?.creatorCode || "",
          noteTypes,
          violationTypes: noteTypes,
          bienBan: entry.bienBan || existingEntry?.bienBan || "",
          attachments: existingEntry?.attachments,
          attachedFiles: existingEntry?.attachedFiles,
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
          violationTypes: normalizeDiaryViolationTypes(noteTypes),
          payload,
          createdAt,
          updatedAt: timestamp,
        };
      });

      for (let offset = 0; offset < records.length; offset += importBatchSize) {
        await txRepository.upsertMany(
          records.slice(offset, offset + importBatchSize),
        );
      }
      return { insertedRows, updatedRows };
    });

    return {
      receivedRows: entries.length,
      sanitizedRows: sanitizedRows.length,
      upsertedRows: importedRows.length,
      ...result,
    };
  };
}
