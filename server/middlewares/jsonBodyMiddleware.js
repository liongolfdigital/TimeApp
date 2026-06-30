import express from "express";

export const DIARY_IMPORT_PATHS = new Set([
  "/api/diary/bulk",
  "/api/diary/import",
  "/api/diary-entries/bulk",
  "/api/diary-entries/import",
]);

/** Chọn body limit lớn hơn riêng cho endpoint import Diary. */
export function createJsonBodyMiddleware() {
  const defaultJsonParser = express.json({ limit: "1mb" });
  const diaryImportJsonParser = express.json({ limit: "4mb" });
  return (request, response, next) => {
    const parser =
      request.method === "POST" && DIARY_IMPORT_PATHS.has(request.path)
        ? diaryImportJsonParser
        : defaultJsonParser;
    return parser(request, response, next);
  };
}
