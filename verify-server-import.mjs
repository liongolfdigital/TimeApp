import assert from "node:assert/strict";
import http from "node:http";

process.env.TIMEKEEPING_LISTEN = "0";
process.env.NODE_ENV = "test";
delete process.env.DATABASE_URL;

const { default: app } = await import("./server.mjs");
assert.equal(typeof app, "function");

const server = http.createServer(app);
await new Promise((resolve, reject) => {
  server.once("error", reject);
  server.listen(0, "127.0.0.1", resolve);
});

const originalConsoleError = console.error;
const capturedErrors = [];
console.error = (...args) => {
  capturedErrors.push(args.map((value) =>
    value instanceof Error ? `${value.name}: ${value.message}` : String(value)).join(" "));
};

try {
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  const health = await healthResponse.json();
  assert.equal(healthResponse.status, 200);
  assert.equal(health.ok, true);
  assert.equal(health.service, "time-app");
  assert.equal(health.database, "unavailable");
  assert.ok(!Number.isNaN(Date.parse(health.time)));

  const loginResponse = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "invalid" }),
  });
  const loginPayload = await loginResponse.json();
  assert.equal(loginResponse.status, 500);
  assert.equal(loginPayload.error, "Khong the dang nhap. Loi may chu.");
  assert.ok(capturedErrors.some((message) => message.includes("[health] database check failed:")));
  assert.ok(capturedErrors.some((message) => message.includes("[auth.login] failed:")));
} finally {
  console.error = originalConsoleError;
  await new Promise((resolve) => server.close(resolve));
}

console.log("Server import, health, and JSON error verification passed");
