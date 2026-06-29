export function createHealthController({ query, nowIso }) {
  return {
    async check(_request, response) {
      let databaseStatus = "connected";
      try {
        await query("SELECT 1");
      } catch (error) {
        databaseStatus = "unavailable";
        console.error("[health] database check failed:", error);
      }
      return response.json({
        ok: true,
        service: "time-app",
        time: nowIso(),
        database: databaseStatus,
      });
    },
  };
}
