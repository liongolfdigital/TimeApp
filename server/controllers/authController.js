export function createAuthController({
  authService,
  handleApiError,
  isProduction,
  sessionTtlMs,
}) {
  return {
    async login(request, response) {
      try {
        const result = await authService.login(
          request.body?.username,
          request.body?.password,
        );
        if (result.status === "invalid") {
          return response.status(401).json({
            error: "Ten dang nhap hoac mat khau khong dung.",
          });
        }
        if (result.status === "blocked") {
          return response.status(403).json({ error: "Tai khoan dang bi khoa." });
        }
        response.cookie?.("timekeeping_session", result.token, {
          httpOnly: true,
          sameSite: "lax",
          secure: isProduction,
          maxAge: sessionTtlMs,
          path: "/",
        });
        return response.json({
          token: result.token,
          user: result.user,
          expiresAt: result.expiresAt,
        });
      } catch (error) {
        console.error("[auth.login] failed:", error);
        const payload = { error: "Khong the dang nhap. Loi may chu." };
        if (!isProduction) payload.detail = error.message;
        return response.status(500).json(payload);
      }
    },
    me(request, response) {
      return response.json({ user: request.user });
    },
    async logout(request, response) {
      try {
        await authService.logout(request.sessionTokenHash, request.user);
        response.clearCookie?.("timekeeping_session", {
          httpOnly: true,
          sameSite: "lax",
          secure: isProduction,
          path: "/",
        });
        return response.status(204).end();
      } catch (error) {
        return handleApiError(response, error, "auth.logout");
      }
    },
  };
}
