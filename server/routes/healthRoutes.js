export function registerHealthRoutes(app, controller) {
  app.get("/api/health", controller.check);
}
