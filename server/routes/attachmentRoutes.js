export function registerAttachmentRoutes(app, {
  requireAuth,
  requireAdmin,
  controller,
}) {
  app.get("/api/attachments/config", requireAuth, controller.config);
  app.get("/api/attachments", requireAuth, controller.list);
  app.post(
    "/api/attachments/:diaryEntryId",
    requireAuth,
    controller.upload,
  );
  app.get("/api/attachments/:id/content", requireAuth, controller.content);
  app.delete("/api/attachments/:id", requireAuth, controller.remove);
  app.delete(
    "/api/diary/:diaryEntryId/attachments",
    requireAuth,
    requireAdmin,
    controller.removeAllForDiary,
  );
}
