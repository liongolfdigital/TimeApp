import path from "node:path";
import express from "express";

/** Mount Vite middleware khi dev hoặc static SPA fallback ở production. */
export async function registerFrontend(app, { isDevelopment, rootDirectory }) {
  if (isDevelopment) {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
    return;
  }

  const distDirectory = path.join(rootDirectory, "dist");
  app.use(express.static(distDirectory));
  app.use((request, response, next) => {
    if (request.method !== "GET" || !request.accepts("html")) return next();
    return response.sendFile(path.join(distDirectory, "index.html"));
  });
}
