export function createAccountController({ accountService, handleApiError }) {
  const handleConflict = (error) => {
    if (error.code === "23505") {
      error.status = 400;
      error.message = "Username da ton tai.";
    }
    return error;
  };

  return {
    async list(_request, response) {
      return response.json(await accountService.list());
    },
    async create(request, response) {
      try {
        return response.status(201).json(
          await accountService.create(request.body || {}, request.user),
        );
      } catch (error) {
        return handleApiError(response, handleConflict(error), "accounts.create");
      }
    },
    async update(request, response) {
      try {
        const account = await accountService.update(
          request.params.id,
          request.body || {},
          request.user,
        );
        return account
          ? response.json(account)
          : response.status(404).json({ error: "Khong tim thay tai khoan." });
      } catch (error) {
        return handleApiError(response, handleConflict(error), "accounts.update");
      }
    },
    async resetPassword(request, response) {
      try {
        const account = await accountService.resetPassword(
          request.params.id,
          request.body?.password,
          request.user,
        );
        return account
          ? response.json(account)
          : response.status(404).json({ error: "Khong tim thay tai khoan." });
      } catch (error) {
        return handleApiError(response, error, "accounts.reset_password");
      }
    },
    async remove(request, response) {
      try {
        const account = await accountService.remove(request.params.id, request.user);
        return account
          ? response.status(204).end()
          : response.status(404).json({ error: "Khong tim thay tai khoan." });
      } catch (error) {
        return handleApiError(response, error, "accounts.delete");
      }
    },
  };
}
