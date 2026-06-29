import crypto from "node:crypto";
import bcrypt from "bcryptjs";

function verifyLegacyPbkdf2(password, storedHash) {
  const [algorithm, iterationsText, salt, expectedHash] = String(storedHash).split("$");
  if (algorithm !== "pbkdf2" || !salt || !expectedHash) return false;
  const iterations = Number(iterationsText);
  if (!Number.isInteger(iterations) || iterations <= 0) return false;

  const actualHash = crypto.pbkdf2Sync(
    String(password),
    salt,
    iterations,
    Buffer.from(expectedHash, "hex").length,
    "sha256",
  );
  const expected = Buffer.from(expectedHash, "hex");
  return expected.length === actualHash.length && crypto.timingSafeEqual(expected, actualHash);
}

function verifyPassword(password, storedHash) {
  if (String(storedHash).startsWith("$2")) {
    return bcrypt.compareSync(String(password), storedHash);
  }
  return verifyLegacyPbkdf2(password, storedHash);
}

/** Xử lý credential/session; không phụ thuộc Express request/response. */
export function createAuthService({
  repository,
  auditService,
  normalizeUsername,
  nowIso,
  serializeAccount,
  sessionTtlMs,
}) {
  const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
  const hashPassword = (password) => bcrypt.hashSync(String(password), 12);

  function readBearerToken(request) {
    const authorization = String(request.headers.authorization ?? "");
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]?.trim()) return match[1].trim();

    const cookie = String(request.headers.cookie ?? "");
    const cookieMatch = cookie
      .split(";")
      .map((item) => item.trim())
      .find((item) => item.startsWith("timekeeping_session="));
    return cookieMatch ? decodeURIComponent(cookieMatch.slice("timekeeping_session=".length)) : "";
  }

  async function getSession(token) {
    if (!token) return null;
    const tokenHash = hashToken(token);
    const row = await repository.findActiveSession(tokenHash, nowIso());
    if (!row || row.status !== "Active") return null;
    return { tokenHash, user: serializeAccount(row) };
  }

  async function login(usernameInput, passwordInput) {
    const username = normalizeUsername(usernameInput);
    const password = String(passwordInput ?? "");
    const account = username ? await repository.findByUsername(username) : null;

    if (!account || !verifyPassword(password, account.password_hash)) {
      await auditService.logAuditSafely("auth.login_failed", {
        user: account ? serializeAccount(account) : { username },
        action: "auth.login_failed",
        targetType: "account",
        targetId: account?.id ?? username,
      });
      return { status: "invalid" };
    }
    if (account.status !== "Active") {
      await auditService.logAuditSafely("auth.login_blocked", {
        user: serializeAccount(account),
        action: "auth.login_blocked",
        targetType: "account",
        targetId: account.id,
      });
      return { status: "blocked" };
    }

    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = hashToken(token);
    const createdAt = nowIso();
    const expiresAt = new Date(Date.now() + sessionTtlMs).toISOString();
    await repository.createSession({
      tokenHash,
      accountId: account.id,
      createdAt,
      expiresAt,
    });
    const user = serializeAccount(account);
    await auditService.logAuditSafely("auth.login", {
      user,
      action: "auth.login",
      targetType: "account",
      targetId: account.id,
    });
    return { status: "ok", token, user, expiresAt };
  }

  async function logout(tokenHash, user) {
    await repository.deleteSessionByToken(tokenHash);
    await auditService.logAuditSafely("auth.logout", {
      user,
      action: "auth.logout",
      targetType: "account",
      targetId: user.id,
    });
  }

  return { getSession, hashPassword, login, logout, readBearerToken };
}
