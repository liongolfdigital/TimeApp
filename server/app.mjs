import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import {
  query,
  transaction,
} from "./db/db.mjs";
import { createRuntimeConfig } from "./config/runtimeConfig.js";
import { createAuthMiddlewares } from "./middlewares/authMiddlewares.js";
import { createApiErrorMiddleware } from "./middlewares/errorMiddleware.js";
import { createDiaryRepository } from "./repositories/diaryRepository.js";
import { createEmployeeRepository } from "./repositories/employeeRepository.js";
import { createAccountRepository } from "./repositories/accountRepository.js";
import { createAttachmentRepository } from "./repositories/attachmentRepository.js";
import { createDiaryService } from "./services/diaryService.js";
import { createEmployeeService } from "./services/employeeService.js";
import { createAttachmentService } from "./services/attachmentService.js";
import { createAccountService } from "./services/accountService.js";
import { createAuditService } from "./services/auditService.js";
import { createAuthService } from "./services/authService.js";
import { createDiaryController } from "./controllers/diaryController.js";
import { createEmployeeController } from "./controllers/employeeController.js";
import { createAccountController } from "./controllers/accountController.js";
import { createAuditController } from "./controllers/auditController.js";
import { createAuthController } from "./controllers/authController.js";
import { createAttachmentController } from "./controllers/attachmentController.js";
import { createHealthController } from "./controllers/healthController.js";
import { registerDiaryImportExportRoutes } from "./routes/diaryRoutes.js";
import { registerEmployeeRoutes } from "./routes/employeeRoutes.js";
import { registerAccountRoutes } from "./routes/accountRoutes.js";
import { registerAuditRoutes } from "./routes/auditRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerAttachmentRoutes } from "./routes/attachmentRoutes.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import {
  getDiaryIdentity,
  sanitizeDiaryEntry,
  normalizeDiaryViolationTypes,
  sortDiaryEntries,
} from "../src/diary/diaryModel.js";
import { nowIso, toIso } from "./utils/dateUtils.js";
import {
  detectRecordBranch,
  normalizeBranch,
  normalizeEmployeeCode,
  normalizeLookup,
  normalizeText,
  normalizeUsername,
} from "./utils/textUtils.js";
import {
  canonicalRole,
  serializeAccount,
  serializeAttachment,
  serializeDiaryRow,
  serializeEmployeeRow,
} from "./utils/serializers.js";
import {
  badRequestError,
  branchForbiddenError,
  createHandleApiError,
} from "./utils/httpErrors.js";

const __dirname = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const {
  allowedAttachmentExtensions,
  diaryImportBatchSize,
  isDevelopment,
  isProduction,
  maxDiaryImportRows,
  maxFileSizeMb,
  port,
  sessionTtlMs,
  uploadDirectory,
} = createRuntimeConfig(__dirname);
const database = { query, transaction };
const diaryRepository = createDiaryRepository(database);
const employeeRepository = createEmployeeRepository(database);
const accountRepository = createAccountRepository(database);
const attachmentRepository = createAttachmentRepository(database);

const handleApiError = createHandleApiError({ isProduction });

const auditService = createAuditService({
  repository: accountRepository,
  createId: () => crypto.randomUUID(),
  nowIso,
  normalizeText,
  toIso,
});
const authService = createAuthService({
  repository: accountRepository,
  auditService,
  normalizeUsername,
  nowIso,
  serializeAccount,
  sessionTtlMs,
});
const accountService = createAccountService({
  repository: accountRepository,
  authService,
  auditService,
  badRequestError,
  canonicalRole,
  createId: () => crypto.randomUUID(),
  normalizeBranch,
  normalizeText,
  normalizeUsername,
  nowIso,
  serializeAccount,
});
const { logAudit } = auditService;

const {
  requireAuth,
  requireAdmin,
  requireDiaryImportExport,
} = createAuthMiddlewares({
  getSession: authService.getSession,
  readBearerToken: authService.readBearerToken,
});

function canAccessBranch(user, branch) {
  if (user?.role === "Admin") return true;
  const normalizedBranch = normalizeBranch(branch);
  return Boolean(user?.branch) && Boolean(normalizedBranch) && normalizedBranch === normalizeBranch(user.branch);
}

const employeeService = createEmployeeService({
  repository: employeeRepository,
  createId: () => crypto.randomUUID(),
  nowIso,
  normalizeText,
  detectRecordBranch,
  normalizeBranch,
  canAccessBranch,
  branchForbiddenError,
  serializeEmployeeRow,
});

async function findEmployeeForDiary(entry) {
  const employeeCode = normalizeEmployeeCode(entry.employeeCode);
  const employeeName = normalizeLookup(entry.employeeName);
  const employees = await employeeService.listAll();

  if (employeeCode) {
    const byCode = employees.find((employee) =>
      normalizeEmployeeCode(employee.employeeCode) === employeeCode,
    );
    if (byCode) return byCode;
  }

  return employeeName
    ? employees.find((employee) => normalizeLookup(employee.employeeName) === employeeName)
    : null;
}

const diaryService = createDiaryService({
  repository: diaryRepository,
  normalizeBranch,
  normalizeText,
  normalizeLookup,
  normalizeEmployeeCode,
  canAccessBranch,
  branchForbiddenError,
  createId: () => crypto.randomUUID(),
  nowIso,
  detectRecordBranch,
  findEmployeeForDiary,
  listEmployeesForDiary: employeeService.listAll,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
  getDiaryIdentity,
  sortDiaryEntries,
  serializeDiaryRow,
  maxImportRows: maxDiaryImportRows,
  importBatchSize: diaryImportBatchSize,
});
const attachmentService = createAttachmentService({
  repository: attachmentRepository,
  diaryService,
  auditService,
  canAccessBranch,
  isProduction,
  maxFileSizeMb,
  allowedAttachmentExtensions,
  uploadDirectory,
  normalizeBranch,
  normalizeText,
  normalizeUsername,
  nowIso,
  serializeAttachment,
  createId: () => crypto.randomUUID(),
});
const diaryController = createDiaryController({
  diaryService,
  logAudit,
  normalizeBranch,
  handleApiError,
  removeStoredFile: attachmentService.removeStoredFile,
});
const employeeController = createEmployeeController({
  employeeService,
  logAudit,
  handleApiError,
});
const authController = createAuthController({
  authService,
  handleApiError,
  isProduction,
  sessionTtlMs,
});
const accountController = createAccountController({
  accountService,
  handleApiError,
});
const auditController = createAuditController({
  auditService,
  handleApiError,
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: maxFileSizeMb * 1024 * 1024, files: 1 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLocaleLowerCase();
    callback(
      allowedAttachmentExtensions.has(extension)
        ? null
        : new Error("Dinh dang file khong duoc ho tro."),
      allowedAttachmentExtensions.has(extension),
    );
  },
});
const attachmentController = createAttachmentController({
  attachmentService,
  handleApiError,
  upload,
});
const healthController = createHealthController({ query, nowIso });

const app = express();
app.disable("x-powered-by");
const defaultJsonParser = express.json({ limit: "1mb" });
const diaryImportJsonParser = express.json({ limit: "4mb" });
const diaryImportPaths = new Set([
  "/api/diary/bulk",
  "/api/diary/import",
  "/api/diary-entries/bulk",
  "/api/diary-entries/import",
]);
app.use((request, response, next) => {
  const parser = request.method === "POST" && diaryImportPaths.has(request.path)
    ? diaryImportJsonParser
    : defaultJsonParser;
  return parser(request, response, next);
});

registerHealthRoutes(app, healthController);

registerAuthRoutes(app, {
  requireAuth,
  controller: authController,
});

registerAccountRoutes(app, {
  requireAuth,
  requireAdmin,
  controller: accountController,
});

registerAuditRoutes(app, {
  requireAuth,
  requireAdmin,
  controller: auditController,
});

registerEmployeeRoutes(app, {
  requireAuth,
  requireAdmin,
  controller: employeeController,
});

registerDiaryImportExportRoutes(app, {
  requireAuth,
  requireAdmin,
  requireDiaryImportExport,
  diaryController,
});

registerAttachmentRoutes(app, {
  requireAuth,
  requireAdmin,
  controller: attachmentController,
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Khong tim thay API." });
});

app.use(createApiErrorMiddleware({
  diaryImportPaths,
  handleApiError,
  maxFileSizeMb,
  MulterError: multer.MulterError,
}));

if (isDevelopment) {
  const { createServer } = await import("vite");
  const vite = await createServer({
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  const distDirectory = path.join(__dirname, "dist");
  app.use(express.static(distDirectory));
  app.use((request, response, next) => {
    if (request.method !== "GET" || !request.accepts("html")) return next();
    return response.sendFile(path.join(distDirectory, "index.html"));
  });
}

if (process.env.VERCEL !== "1" && process.env.TIMEKEEPING_LISTEN !== "0") {
  app.listen(port, () => {
    console.log(`Timekeeping server running at http://localhost:${port}`);
  });
}

export default app;
