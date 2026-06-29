import fs from "node:fs";

export function createAttachmentController({
  attachmentService,
  handleApiError,
  upload,
}) {
  return {
    config(_request, response) {
      return response.json(attachmentService.getConfig());
    },
    async list(request, response) {
      try {
        const diaryEntryId = String(request.query.diaryEntryId ?? "").trim();
        return response.json(await attachmentService.list(diaryEntryId, request.user));
      } catch (error) {
        return handleApiError(response, error, "attachments.list");
      }
    },
    upload(request, response, next) {
      upload.single("file")(request, response, (error) => {
        if (error) return next(error);
        attachmentService.save({
          diaryEntryId: String(request.params.diaryEntryId ?? "").trim(),
          file: request.file,
          uploadedBy: request.body.uploadedBy,
          replaceAttachmentId: String(request.body.replaceAttachmentId ?? "").trim(),
          requestedBranch: request.body.branch,
          user: request.user,
        }).then(({ attachment, replaced }) => (
          response.status(replaced ? 200 : 201).json(attachment)
        )).catch(next);
      });
    },
    async content(request, response) {
      try {
        const attachment = await attachmentService.getContent(
          request.params.id,
          request.user,
        );
        if (!attachment) {
          return response.status(404).json({ error: "Khong tim thay file dinh kem." });
        }
        if (/^https?:\/\//i.test(attachment.blob_url)) {
          return response.redirect(302, attachment.blob_url);
        }
        if (!attachment.blob_pathname || !fs.existsSync(attachment.blob_pathname)) {
          return response.status(404).json({ error: "Khong tim thay file dinh kem." });
        }
        const inline = request.query.download !== "1"
          && (attachment.file_type.startsWith("image/")
            || attachment.file_type === "application/pdf");
        const encodedName = encodeURIComponent(attachment.file_name);
        response.setHeader("Content-Type", attachment.file_type);
        response.setHeader("Content-Length", attachment.file_size);
        response.setHeader(
          "Content-Disposition",
          `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodedName}`,
        );
        response.setHeader("X-Content-Type-Options", "nosniff");
        return response.sendFile(attachment.blob_pathname);
      } catch (error) {
        return handleApiError(response, error, "attachments.content");
      }
    },
    async remove(request, response) {
      try {
        const attachment = await attachmentService.remove(
          request.params.id,
          request.user,
        );
        return attachment
          ? response.status(204).end()
          : response.status(404).json({ error: "Khong tim thay file." });
      } catch (error) {
        return handleApiError(response, error, "attachments.delete");
      }
    },
    async removeAllForDiary(request, response) {
      try {
        const deletedCount = await attachmentService.removeAllForDiary(
          String(request.params.diaryEntryId ?? "").trim(),
          request.user,
        );
        return deletedCount === null
          ? response.status(404).json({ error: "Khong tim thay ghi chu." })
          : response.status(204).end();
      } catch (error) {
        return handleApiError(response, error, "attachments.delete_all");
      }
    },
  };
}
