export function createAuditController({ auditService, handleApiError }) {
  return {
    async create(request, response) {
      try {
        await auditService.recordClientAction(request.body, request.user);
        return response.status(201).json({ ok: true });
      } catch (error) {
        return handleApiError(response, error, "audit.create");
      }
    },
    async list(request, response) {
      try {
        return response.json(await auditService.list(request.query.limit));
      } catch (error) {
        return handleApiError(response, error, "audit.list");
      }
    },
  };
}
