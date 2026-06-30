import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { createApplicationContext } from "./bootstrap/createApplicationContext.mjs";
import { createRuntimeConfig } from "./config/runtimeConfig.js";
import { query, transaction } from "./db/db.mjs";
import { createApiErrorMiddleware } from "./middlewares/errorMiddleware.js";
import {
  createJsonBodyMiddleware,
  DIARY_IMPORT_PATHS,
} from "./middlewares/jsonBodyMiddleware.js";
import { registerAccountRoutes } from "./routes/accountRoutes.js";
import { registerAttachmentRoutes } from "./routes/attachmentRoutes.js";
import { registerAuditRoutes } from "./routes/auditRoutes.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerDiaryImportExportRoutes } from "./routes/diaryRoutes.js";
import { registerEmployeeRoutes } from "./routes/employeeRoutes.js";
import { registerHealthRoutes } from "./routes/healthRoutes.js";
import { createHandleApiError } from "./utils/httpErrors.js";
import { registerFrontend } from "./web/registerFrontend.js";

const rootDirectory = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const config = createRuntimeConfig(rootDirectory);
const handleApiError = createHandleApiError({
  isProduction: config.isProduction,
});
const { controllers, guards } = createApplicationContext({
  config,
  database: { query, transaction },
  handleApiError,
});

const app = express();
app.disable("x-powered-by");
app.use(createJsonBodyMiddleware());

registerHealthRoutes(app, controllers.health);
registerAuthRoutes(app, {
  requireAuth: guards.requireAuth,
  controller: controllers.auth,
});
registerAccountRoutes(app, {
  requireAuth: guards.requireAuth,
  requireAdmin: guards.requireAdmin,
  controller: controllers.account,
});
registerAuditRoutes(app, {
  requireAuth: guards.requireAuth,
  requireAdmin: guards.requireAdmin,
  controller: controllers.audit,
});
registerEmployeeRoutes(app, {
  requireAuth: guards.requireAuth,
  requireAdmin: guards.requireAdmin,
  controller: controllers.employee,
});
registerDiaryImportExportRoutes(app, {
  requireAuth: guards.requireAuth,
  requireAdmin: guards.requireAdmin,
  requireDiaryImportExport: guards.requireDiaryImportExport,
  diaryController: controllers.diary,
});
registerAttachmentRoutes(app, {
  requireAuth: guards.requireAuth,
  requireAdmin: guards.requireAdmin,
  controller: controllers.attachment,
});

app.use("/api", (_request, response) => {
  response.status(404).json({ error: "Khong tim thay API." });
});
app.use(createApiErrorMiddleware({
  diaryImportPaths: DIARY_IMPORT_PATHS,
  handleApiError,
  maxFileSizeMb: config.maxFileSizeMb,
  MulterError: multer.MulterError,
}));

await registerFrontend(app, {
  isDevelopment: config.isDevelopment,
  rootDirectory,
});

if (process.env.VERCEL !== "1" && process.env.TIMEKEEPING_LISTEN !== "0") {
  app.listen(config.port, () => {
    console.log(`Timekeeping server running at http://localhost:${config.port}`);
  });
}

export default app;
