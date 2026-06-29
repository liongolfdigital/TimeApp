export function registerAuditRoutes(app, { requireAuth, requireAdmin, controller }) {
  app.post("/api/audit-logs", requireAuth, controller.create);
  app.get("/api/audit-logs", requireAuth, requireAdmin, controller.list);
}
