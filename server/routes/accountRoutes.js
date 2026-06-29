export function registerAccountRoutes(app, { requireAuth, requireAdmin, controller }) {
  app.get("/api/accounts", requireAuth, requireAdmin, controller.list);
  app.post("/api/accounts", requireAuth, requireAdmin, controller.create);
  app.put("/api/accounts/:id", requireAuth, requireAdmin, controller.update);
  app.post(
    "/api/accounts/:id/password",
    requireAuth,
    requireAdmin,
    controller.resetPassword,
  );
  app.delete("/api/accounts/:id", requireAuth, requireAdmin, controller.remove);
}
