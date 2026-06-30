import path from "node:path";
import multer from "multer";

/** Cấu hình multer memory upload và whitelist extension attachment. */
export function createAttachmentUploadMiddleware({
  allowedAttachmentExtensions,
  maxFileSizeMb,
}) {
  return multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxFileSizeMb * 1024 * 1024, files: 1 },
    fileFilter: (_request, file, callback) => {
      const extension = path.extname(file.originalname).toLocaleLowerCase();
      const allowed = allowedAttachmentExtensions.has(extension);
      callback(
        allowed ? null : new Error("Dinh dang file khong duoc ho tro."),
        allowed,
      );
    },
  });
}
