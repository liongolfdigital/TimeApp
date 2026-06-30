import fs from "node:fs";
import path from "node:path";
import { del, put } from "@vercel/blob";

function safeFilename(name) {
  return path.basename(String(name || "attachment")).replace(/[^\w.-]+/g, "_");
}

/** Adapter lưu/xóa bytes attachment trên Vercel Blob hoặc filesystem local. */
export function createAttachmentFileStorage({
  isProduction,
  uploadDirectory,
}) {
  async function removeStoredFile(attachment) {
    const blobUrl = attachment?.blob_url || "";
    const pathname = attachment?.blob_pathname || "";
    if (/^https?:\/\//i.test(blobUrl)) {
      if (!process.env.BLOB_READ_WRITE_TOKEN) return;
      await del(blobUrl).catch(() => {});
      return;
    }
    if (!pathname) return;
    await fs.promises.unlink(pathname).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }

  async function storeUploadedFile(file, id) {
    const extension = path.extname(file.originalname).toLocaleLowerCase();
    const storedName =
      `${Date.now()}-${safeFilename(file.originalname) || `${id}${extension}`}`;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blob = await put(
        `diary-attachments/${id}/${storedName}`,
        file.buffer,
        {
          access: "public",
          contentType: file.mimetype || "application/octet-stream",
          addRandomSuffix: false,
        },
      );
      return { blobUrl: blob.url, blobPathname: blob.pathname };
    }
    if (isProduction) {
      const error = new Error("Vercel Blob chua duoc cau hinh cho file dinh kem.");
      error.status = 503;
      throw error;
    }
    await fs.promises.mkdir(uploadDirectory, { recursive: true });
    const localPath = path.join(uploadDirectory, `${id}-${storedName}`);
    await fs.promises.writeFile(localPath, file.buffer);
    return {
      blobUrl: `/api/attachments/${id}/content`,
      blobPathname: localPath,
    };
  }

  return { removeStoredFile, storeUploadedFile };
}
