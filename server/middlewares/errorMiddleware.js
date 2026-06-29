export function createApiErrorMiddleware({
  diaryImportPaths,
  handleApiError,
  maxFileSizeMb,
  MulterError,
}) {
  return function apiErrorMiddleware(error, request, response, _next) {
    if (error?.type === "entity.too.large") {
      console.error(`[${request.method} ${request.path}] body too large:`, error.message);
      return response.status(413).json({
        error: diaryImportPaths.has(request.path)
          ? "File Diary quá lớn, vui lòng chia nhỏ file để import."
          : "Du lieu gui len qua lon.",
      });
    }
    if (error instanceof MulterError && error.code === "LIMIT_FILE_SIZE") {
      console.error(`[${request.method} ${request.path}] file too large:`, error.message);
      return response.status(413).json({
        error: `File vuot qua gioi han ${maxFileSizeMb}MB.`,
      });
    }
    return handleApiError(response, error, `${request.method} ${request.path}`);
  };
}
