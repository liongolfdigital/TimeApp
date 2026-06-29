export function registerAuthRoutes(app, { requireAuth, controller }) {
  app.post("/api/auth/login", controller.login);
  app.get("/api/auth/me", requireAuth, controller.me);
  app.post("/api/auth/logout", requireAuth, controller.logout);
}
