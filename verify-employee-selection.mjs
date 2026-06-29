import assert from "node:assert/strict";
import { registerEmployeeRoutes } from "./server/routes/employeeRoutes.js";
import { createEmployeeService } from "./server/services/employeeService.js";
import {
  getEmployeeBulkDeleteLabel,
  getVisibleEmployeeSelectionState,
  toggleAllVisibleEmployeeSelection,
  toggleEmployeeSelection,
} from "./src/employees/employeeSelection.js";

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
const hiddenId = "33333333-3333-4333-8333-333333333333";

let selectedIds = toggleEmployeeSelection([], firstId);
assert.deepEqual(selectedIds, [firstId]);
selectedIds = toggleEmployeeSelection(selectedIds, secondId);
assert.deepEqual(selectedIds, [firstId, secondId]);
selectedIds = toggleEmployeeSelection(selectedIds, firstId);
assert.deepEqual(selectedIds, [secondId]);
assert.equal(getEmployeeBulkDeleteLabel(2), "Xóa đã chọn (2)");
assert.equal(getEmployeeBulkDeleteLabel(2, true), "Đang xóa...");

const partiallySelected = getVisibleEmployeeSelectionState([firstId], [firstId, secondId]);
assert.equal(partiallySelected.allSelected, false);
assert.equal(partiallySelected.someSelected, true);
assert.equal(partiallySelected.selectedVisibleCount, 1);

const selectedWithHidden = toggleAllVisibleEmployeeSelection([hiddenId], [firstId, secondId]);
assert.deepEqual(new Set(selectedWithHidden), new Set([hiddenId, firstId, secondId]));
assert.equal(
  getVisibleEmployeeSelectionState(selectedWithHidden, [firstId, secondId]).allSelected,
  true,
);
assert.deepEqual(
  toggleAllVisibleEmployeeSelection(selectedWithHidden, [firstId, secondId]),
  [hiddenId],
);

const routes = [];
const app = Object.fromEntries(["get", "post", "put", "delete"].map((method) => [
  method,
  (path, ...handlers) => routes.push({ method, path, handlers }),
]));
const middleware = () => {};
const controller = {
  list: middleware,
  create: middleware,
  update: middleware,
  remove: middleware,
  bulkReplace: middleware,
  bulkDelete: middleware,
};
registerEmployeeRoutes(app, {
  requireAuth: middleware,
  requireAdmin: middleware,
  controller,
});
const bulkDeleteIndex = routes.findIndex(
  ({ method, path }) => method === "delete" && path === "/api/employees/bulk",
);
const singleDeleteIndex = routes.findIndex(
  ({ method, path }) => method === "delete" && path === "/api/employees/:id",
);
assert.ok(bulkDeleteIndex >= 0);
assert.ok(bulkDeleteIndex < singleDeleteIndex);
assert.equal(routes[bulkDeleteIndex].handlers.at(-1), controller.bulkDelete);

const deleteCalls = [];
const repository = {
  async deleteMany(ids) {
    deleteCalls.push([...ids]);
    return ids;
  },
};
const service = createEmployeeService({
  repository,
  createId: () => firstId,
  nowIso: () => "2026-06-29T00:00:00.000Z",
  normalizeText: (value) => String(value ?? "").trim(),
  detectRecordBranch: () => "",
  normalizeBranch: (value) => String(value ?? ""),
  canAccessBranch: () => true,
  branchForbiddenError: () => Object.assign(new Error("Forbidden"), { status: 403 }),
  serializeEmployeeRow: (row) => row,
});

assert.deepEqual(
  await service.deleteMany([firstId, secondId, firstId], { role: "Admin" }),
  [firstId, secondId],
);
assert.deepEqual(deleteCalls, [[firstId, secondId]]);
await assert.rejects(
  () => service.deleteMany([firstId], { role: "Manager" }),
  (error) => error.status === 403,
);
await assert.rejects(
  () => service.deleteMany([], { role: "Admin" }),
  (error) => error.status === 400,
);
await assert.rejects(
  () => service.deleteMany(["not-a-uuid"], { role: "Admin" }),
  (error) => error.status === 400,
);

console.log("Employee selection and bulk delete verification passed");
