import assert from "node:assert/strict";
import { registerDiaryImportExportRoutes } from "./server/routes/diaryRoutes.js";
import { createDiaryService } from "./server/services/diaryService.js";
import { serializeDiaryRow } from "./server/utils/serializers.js";
import {
  getDiaryIdentity,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
  sortDiaryEntries,
} from "./src/diary/diaryModel.js";
import { normalizeLookup, normalizeText } from "./src/employees/employeeModel.js";

function normalizeBranch(value) {
  const text = normalizeText(value).toUpperCase();
  if (text.includes("Q7") || text.includes("QUẬN 7")) return "Q7";
  if (text.includes("OL") || text.includes("ONLINE")) return "OL";
  return text;
}

function detectRecordBranch(record = {}) {
  return [
    record.branch,
    record.chiNhanh,
    record.chi_nhanh,
    record.store,
    record.location,
    record.employeeCode,
    record.employeeName,
  ].map(normalizeBranch).find((branch) => ["Q7", "OL"].includes(branch)) || "";
}

function normalizeEmployeeCode(value) {
  const code = normalizeLookup(value).replace(/\s+/g, "");
  return /^\d+$/.test(code) ? code.replace(/^0+(?=\d)/, "") : code;
}

function createFakeRepository(initialRows = []) {
  const state = {
    rows: initialRows.map((row) => ({ ...row })),
    attachments: [],
    batches: [],
    deleteCalls: [],
    lockCount: 0,
  };
  const repository = {
    async lockForImport() {
      state.lockCount += 1;
    },
    async listByDates(dates, branch = "") {
      return state.rows
        .filter((row) => dates.includes(row.date))
        .filter((row) => !branch || normalizeBranch(row.branch) === normalizeBranch(branch));
    },
    async listAll() {
      return [...state.rows];
    },
    async listByBranch(branch) {
      return state.rows.filter((row) =>
        normalizeBranch(row.branch) === normalizeBranch(branch));
    },
    async findManyByIds(ids) {
      return state.rows.filter(({ id }) => ids.includes(id));
    },
    async findById(id) {
      return state.rows.find((row) => row.id === id) ?? null;
    },
    async listAttachmentsByDiaryIds(ids) {
      return state.attachments.filter(({ diary_entry_id: diaryEntryId }) =>
        ids.includes(diaryEntryId));
    },
    async deleteMany(ids) {
      const deletedIds = state.rows.filter(({ id }) => ids.includes(id)).map(({ id }) => id);
      state.deleteCalls.push([...ids]);
      state.rows = state.rows.filter(({ id }) => !ids.includes(id));
      state.attachments = state.attachments.filter(
        ({ diary_entry_id: diaryEntryId }) => !ids.includes(diaryEntryId),
      );
      return deletedIds;
    },
    async upsertMany(records) {
      state.batches.push(records.length);
      for (const record of records) {
        const row = {
          id: record.id,
          branch: record.branch,
          date: record.payload.date,
          employee_code: record.employeeCode,
          employee_name: record.employeeName,
          reason: record.payload.note,
          permission: record.payload.permissionStatus,
          creator_code: record.payload.creatorCode,
          creator_name: record.payload.recordMaker,
          violation_types: record.violationTypes,
          payload: record.payload,
          created_at: record.createdAt,
          updated_at: record.updatedAt,
        };
        const index = state.rows.findIndex(({ id }) => id === record.id);
        if (index >= 0) state.rows[index] = row;
        else state.rows.push(row);
      }
      return [];
    },
    async upsert(record) {
      await repository.upsertMany([record]);
    },
    transaction(callback) {
      return callback(repository);
    },
  };
  return { repository, state };
}

function createService(repository, maxImportRows = 5000) {
  let idSequence = 0;
  const employees = [
    { branch: "Q7", employeeCode: "E1", employeeName: "Nhân viên Q7" },
    { branch: "OL", employeeCode: "E2", employeeName: "Nhân viên OL" },
  ];
  return createDiaryService({
    repository,
    normalizeBranch,
    normalizeText,
    normalizeLookup,
    normalizeEmployeeCode,
    canAccessBranch: (user, branch) =>
      user.role === "Admin" || normalizeBranch(user.branch) === normalizeBranch(branch),
    branchForbiddenError: () => Object.assign(new Error("Sai phạm vi chi nhánh"), { status: 403 }),
    createId: () => `00000000-0000-4000-8000-${String(++idSequence).padStart(12, "0")}`,
    nowIso: () => "2026-06-28T00:00:00.000Z",
    detectRecordBranch,
    findEmployeeForDiary: async () => null,
    listEmployeesForDiary: async () => employees,
    normalizeDiaryViolationTypes,
    sanitizeDiaryEntry,
    getDiaryIdentity,
    sortDiaryEntries,
    serializeDiaryRow,
    maxImportRows,
    importBatchSize: 200,
  });
}

const registeredRoutes = [];
const fakeApp = Object.fromEntries(
  ["get", "post", "put", "delete"].map((method) => [
    method,
    (path, ...handlers) => registeredRoutes.push({ method, path, handlers }),
  ]),
);
const middleware = () => {};
const routeController = {
  list: middleware,
  create: middleware,
  update: middleware,
  remove: middleware,
  exportEntries: middleware,
  importEntries: middleware,
  deleteEntries: middleware,
};
registerDiaryImportExportRoutes(fakeApp, {
  requireAuth: middleware,
  requireAdmin: middleware,
  requireDiaryImportExport: middleware,
  diaryController: routeController,
});
const bulkPostIndex = registeredRoutes.findIndex(
  ({ method, path }) => method === "post" && path === "/api/diary/bulk",
);
const bulkDeleteIndex = registeredRoutes.findIndex(
  ({ method, path }) => method === "delete" && path === "/api/diary/bulk",
);
const parameterDeleteIndex = registeredRoutes.findIndex(
  ({ method, path }) => method === "delete" && path === "/api/diary/:id",
);
assert.ok(bulkPostIndex >= 0);
assert.ok(bulkDeleteIndex >= 0);
assert.ok(bulkDeleteIndex < parameterDeleteIndex);
assert.equal(
  registeredRoutes[bulkDeleteIndex].handlers.at(-1),
  routeController.deleteEntries,
);

const existingId = "11111111-1111-4111-8111-111111111111";
const { repository, state } = createFakeRepository([{
  id: existingId,
  branch: "Q7",
  date: "2026-06-28",
  employee_code: "E1",
  employee_name: "Nhân viên Q7",
  reason: "Ghi chú cũ",
  permission: "Có phép",
  creator_code: "QL01",
  creator_name: "Quản lý cũ",
  violation_types: ["Đi trễ", "OFF"],
  payload: {
    id: existingId,
    branch: "Q7",
    date: "2026-06-28",
    employeeCode: "E1",
    employeeName: "Nhân viên Q7",
    reason: "Ghi chú cũ",
    permission: "Có phép",
    creatorCode: "QL01",
    creatorName: "Quản lý cũ",
    violationTypes: ["Đi trễ", "OFF"],
  },
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
}]);
const service = createService(repository);
const importRows = Array.from({ length: 205 }, (_, index) => ({
  branch: "Q7",
  date: "2026-06-28",
  employeeCode: index === 0 ? "E1" : `Q7-${index}`,
  employeeName: index === 0 ? "Nhân viên Q7" : `Nhân viên ${index}`,
  checkIn1: "8:00",
  checkOut1: "17:30",
  checkIn2: "",
  checkOut2: "",
  note: `Ghi chú mới ${index}`,
}));
importRows.push({ ...importRows[1], note: "Ghi chú được cập nhật trong cùng file" });
state.attachments.push({
  id: "attachment-1",
  diary_entry_id: existingId,
  blob_url: "https://example.invalid/attachment-1",
});

const result = await service.importDiaryRecords(importRows, { role: "Admin", branch: "" });
assert.deepEqual(result, {
  receivedRows: 206,
  sanitizedRows: 206,
  upsertedRows: 205,
  insertedRows: 204,
  updatedRows: 1,
});
assert.deepEqual(state.batches, [200, 5]);
assert.equal(state.lockCount, 1);
assert.equal(state.rows.length, 205);
assert.ok(state.rows.some(({ id }) => id === existingId));
const updatedExisting = serializeDiaryRow(
  state.rows.find(({ id }) => id === existingId),
);
assert.equal(updatedExisting.note, "Ghi chú mới 0");
assert.equal(updatedExisting.checkIn1, "08:00");
assert.equal(updatedExisting.checkOut1, "17:30");
assert.equal(updatedExisting.permissionStatus, "Có phép");
assert.equal(updatedExisting.recordMaker, "Quản lý cũ");
assert.deepEqual(updatedExisting.noteTypes, ["OFF"]);
assert.equal(state.attachments.length, 1);

const insertedId = state.rows.find(({ id }) => id !== existingId).id;
const deleteResult = await service.deleteDiaryRecords(
  [existingId, insertedId],
  { role: "Manager", branch: "Q7" },
);
assert.equal(deleteResult.deletedCount, 2);
assert.deepEqual(new Set(deleteResult.deletedIds), new Set([existingId, insertedId]));
assert.equal(deleteResult.attachments.length, 1);
assert.equal(state.deleteCalls.length, 1);
assert.deepEqual(new Set(state.deleteCalls[0]), new Set([existingId, insertedId]));

const olDiaryId = "22222222-2222-4222-8222-222222222222";
state.rows.push({
  id: olDiaryId,
  branch: "OL",
  date: "2026-06-28",
  employee_code: "E2",
  employee_name: "Nhân viên OL",
  reason: "Không được xóa",
  violation_types: [],
  payload: {},
  created_at: "2026-06-01T00:00:00.000Z",
  updated_at: "2026-06-01T00:00:00.000Z",
});
const managerVisibleRows = await service.listForUser({
  role: "Manager",
  branch: "Q7",
});
assert.ok(managerVisibleRows.length > 0);
assert.ok(managerVisibleRows.every(({ branch }) => branch === "Q7"));
assert.ok(!managerVisibleRows.some(({ id }) => id === olDiaryId));
await assert.rejects(
  () => service.deleteDiaryRecords([olDiaryId], { role: "Manager", branch: "Q7" }),
  (error) => error.status === 403,
);
assert.ok(state.rows.some(({ id }) => id === olDiaryId));
assert.equal(state.deleteCalls.length, 1);

await assert.rejects(
  () => service.deleteDiaryRecords([], { role: "Admin", branch: "" }),
  (error) => error.status === 400,
);
await assert.rejects(
  () => service.deleteDiaryRecords(["not-a-uuid"], { role: "Admin", branch: "" }),
  (error) => error.status === 400,
);

await assert.rejects(
  () => service.importDiaryRecords([{
    branch: "Q7",
    date: "2026-06-28",
    employeeCode: "E2",
    employeeName: "Nhân viên OL",
    reason: "Sai chi nhánh",
  }], { role: "Manager", branch: "Q7" }),
  (error) => error.status === 403,
);

const sizeLimitedService = createService(repository, 2);
await assert.rejects(
  () => sizeLimitedService.importDiaryRecords([], { role: "Admin", branch: "" }),
  (error) => error.status === 400,
);
await assert.rejects(
  () => sizeLimitedService.importDiaryRecords(undefined, { role: "Admin", branch: "" }),
  (error) => error.status === 400,
);
await assert.rejects(
  () => sizeLimitedService.importDiaryRecords(importRows.slice(0, 3), { role: "Admin", branch: "" }),
  /File Diary quá lớn, vui lòng chia nhỏ file để import\./,
);

const manualRepositoryState = createFakeRepository();
const manualService = createService(manualRepositoryState.repository);
const manuallyCreated = await manualService.save({
  branch: "Q7",
  date: "2026-07-20",
  employeeCode: "E1",
  employeeName: "Nhân viên Q7",
  note: "Tạo thủ công",
  noteTypes: ["Đi trễ", "Về sớm"],
}, { role: "Admin", branch: "" });
assert.deepEqual(manuallyCreated.noteTypes, ["Đi trễ", "Về sớm"]);
const manualExistingRow = manualRepositoryState.state.rows.find(
  ({ id }) => id === manuallyCreated.id,
);
const manuallyUpdated = await manualService.save({
  ...manuallyCreated,
  note: "Sửa thủ công",
  noteTypes: ["Khác", "OFF", "Hỗ trợ CN"],
}, { role: "Admin", branch: "" }, manualExistingRow);
assert.deepEqual(manuallyUpdated.noteTypes, ["OFF"]);

console.log("Diary batch import/upsert verification passed");
