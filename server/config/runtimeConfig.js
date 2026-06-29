import path from "node:path";

export const ALLOWED_ATTACHMENT_EXTENSIONS = Object.freeze([
  ".jpg", ".jpeg", ".png", ".webp",
  ".pdf", ".doc", ".docx", ".xls", ".xlsx",
]);

/** Đọc toàn bộ cấu hình runtime một lần để app composition không rải process.env khắp nơi. */
export function createRuntimeConfig(rootDirectory) {
  const isDevelopment = process.argv.includes("--dev");
  const isProduction = process.env.NODE_ENV === "production" || process.env.VERCEL === "1";
  const configuredSessionTtlMs = Number(process.env.SESSION_TTL_MS);
  const sessionTtlMs = Number.isFinite(configuredSessionTtlMs) && configuredSessionTtlMs > 0
    ? configuredSessionTtlMs
    : 7 * 24 * 60 * 60 * 1000;
  const dataDirectory = path.resolve(
    process.env.TIMEKEEPING_DATA_DIR || path.join(rootDirectory, "data"),
  );

  return Object.freeze({
    isDevelopment,
    isProduction,
    port: Number(process.env.PORT) || 5173,
    maxFileSizeMb: Number(process.env.ATTACHMENT_MAX_MB) || 20,
    maxDiaryImportRows: Math.max(Number(process.env.DIARY_IMPORT_MAX_ROWS) || 5000, 1),
    diaryImportBatchSize: Math.min(
      Math.max(Number(process.env.DIARY_IMPORT_BATCH_SIZE) || 300, 200),
      500,
    ),
    dataDirectory,
    uploadDirectory: path.join(dataDirectory, "uploads"),
    sessionTtlMs,
    allowedAttachmentExtensions: new Set(ALLOWED_ATTACHMENT_EXTENSIONS),
  });
}
