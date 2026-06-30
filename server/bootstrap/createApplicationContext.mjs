import crypto from "node:crypto";
import {
  getDiaryIdentity,
  normalizeDiaryViolationTypes,
  sanitizeDiaryEntry,
  sortDiaryEntries,
} from "../../src/diary/diaryModel.js";
import { createAccountController } from "../controllers/accountController.js";
import { createAttachmentController } from "../controllers/attachmentController.js";
import { createAuditController } from "../controllers/auditController.js";
import { createAuthController } from "../controllers/authController.js";
import { createDiaryController } from "../controllers/diaryController.js";
import { createEmployeeController } from "../controllers/employeeController.js";
import { createHealthController } from "../controllers/healthController.js";
import { createAuthMiddlewares } from "../middlewares/authMiddlewares.js";
import { createAttachmentUploadMiddleware } from "../middlewares/attachmentUploadMiddleware.js";
import { createAccountRepository } from "../repositories/accountRepository.js";
import { createAttachmentRepository } from "../repositories/attachmentRepository.js";
import { createDiaryRepository } from "../repositories/diaryRepository.js";
import { createEmployeeRepository } from "../repositories/employeeRepository.js";
import { createAccountService } from "../services/accountService.js";
import { createAttachmentService } from "../services/attachmentService.js";
import { createAuditService } from "../services/auditService.js";
import { createAuthService } from "../services/authService.js";
import { createDiaryService } from "../services/diaryService.js";
import { createEmployeeService } from "../services/employeeService.js";
import { nowIso, toIso } from "../utils/dateUtils.js";
import { badRequestError, branchForbiddenError } from "../utils/httpErrors.js";
import {
  canonicalRole,
  serializeAccount,
  serializeAttachment,
  serializeDiaryRow,
  serializeEmployeeRow,
} from "../utils/serializers.js";
import {
  detectRecordBranch,
  normalizeBranch,
  normalizeEmployeeCode,
  normalizeLookup,
  normalizeText,
  normalizeUsername,
} from "../utils/textUtils.js";

/** Compose repository/service/controller và auth guard cho Express app. */
export function createApplicationContext({
  config,
  database,
  handleApiError,
}) {
  const diaryRepository = createDiaryRepository(database);
  const employeeRepository = createEmployeeRepository(database);
  const accountRepository = createAccountRepository(database);
  const attachmentRepository = createAttachmentRepository(database);
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
    sessionTtlMs: config.sessionTtlMs,
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
  const authMiddlewares = createAuthMiddlewares({
    getSession: authService.getSession,
    readBearerToken: authService.readBearerToken,
  });
  const canAccessBranch = (user, branch) => {
    if (user?.role === "Admin") return true;
    const normalizedBranch = normalizeBranch(branch);
    return Boolean(user?.branch) &&
      Boolean(normalizedBranch) &&
      normalizedBranch === normalizeBranch(user.branch);
  };
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
  const findEmployeeForDiary = async (entry) => {
    const employeeCode = normalizeEmployeeCode(entry.employeeCode);
    const employeeName = normalizeLookup(entry.employeeName);
    const employees = await employeeService.listAll();
    if (employeeCode) {
      const byCode = employees.find((employee) =>
        normalizeEmployeeCode(employee.employeeCode) === employeeCode);
      if (byCode) return byCode;
    }
    return employeeName
      ? employees.find((employee) =>
          normalizeLookup(employee.employeeName) === employeeName)
      : null;
  };
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
    maxImportRows: config.maxDiaryImportRows,
    importBatchSize: config.diaryImportBatchSize,
  });
  const attachmentService = createAttachmentService({
    repository: attachmentRepository,
    diaryService,
    auditService,
    canAccessBranch,
    isProduction: config.isProduction,
    maxFileSizeMb: config.maxFileSizeMb,
    allowedAttachmentExtensions: config.allowedAttachmentExtensions,
    uploadDirectory: config.uploadDirectory,
    normalizeBranch,
    normalizeText,
    normalizeUsername,
    nowIso,
    serializeAttachment,
    createId: () => crypto.randomUUID(),
  });
  const logAudit = auditService.logAudit;
  const upload = createAttachmentUploadMiddleware(config);

  return {
    controllers: {
      account: createAccountController({ accountService, handleApiError }),
      attachment: createAttachmentController({
        attachmentService,
        handleApiError,
        upload,
      }),
      audit: createAuditController({ auditService, handleApiError }),
      auth: createAuthController({
        authService,
        handleApiError,
        isProduction: config.isProduction,
        sessionTtlMs: config.sessionTtlMs,
      }),
      diary: createDiaryController({
        diaryService,
        logAudit,
        normalizeBranch,
        handleApiError,
        removeStoredFile: attachmentService.removeStoredFile,
      }),
      employee: createEmployeeController({
        employeeService,
        logAudit,
        handleApiError,
      }),
      health: createHealthController({ query: database.query, nowIso }),
    },
    guards: authMiddlewares,
  };
}
