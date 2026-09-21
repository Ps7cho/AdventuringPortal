/* Browser-only API client. No database access, service keys, or shared credentials. */
(() => {
  "use strict";
  const url = new URL(window.APP_CONFIG.apiBaseUrl);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash ||
      !(url.protocol === "https:" || (loopback && url.protocol === "http:"))) {
    throw new Error("Configure a public HTTPS API base URL (HTTP is allowed only on localhost).");
  }
  const base = url.href.replace(/\/$/, "");
  const sessionKey = "mosswood-session:" + base;
  const clearSession = () => sessionStorage.removeItem(sessionKey);
  function token() {
    try {
      const session = JSON.parse(sessionStorage.getItem(sessionKey) || "null");
      if (session && session.expiresAt > Date.now()) return session.token;
    } catch { /* Discard malformed browser state. */ }
    clearSession();
    return null;
  }
  class ApiError extends Error {
    constructor(message, status = 0, code) {
      super(message); this.name = "ApiError"; this.status = status; this.code = code;
    }
  }
  async function request(path, body) {
    if (!path.startsWith("/") || path.startsWith("//") || path.includes("..")) {
      throw new ApiError("API paths must be relative to the configured endpoint.");
    }
    const headers = { Accept: "application/json" };
    const accessToken = token();
    if (accessToken) headers.Authorization = "Bearer " + accessToken;
    if (body !== undefined) headers["Content-Type"] = "application/json";
    const login = path === "/auth/login" || path === "/auth/register";
    if (login) headers["X-Client-Auth"] = "bearer";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const response = await fetch(base + path, {
        method: body === undefined ? "GET" : "POST", headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit", cache: "no-store", redirect: "error", signal: controller.signal,
      });
      if (response.status === 204) {
        if (path === "/auth/logout") clearSession();
        return null;
      }
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        if (response.status === 401 && !login) clearSession();
        const detail = data?.detail;
        const message = typeof detail === "string" ? detail : detail?.message ||
          (Array.isArray(detail) ? detail.map(item => item.msg).join("; ") : `Request failed (${response.status}).`);
        throw new ApiError(message, response.status, detail?.code);
      }
      if (login) {
        sessionStorage.setItem(sessionKey, JSON.stringify({
          token: data.access_token, expiresAt: Date.now() + data.expires_in * 1000,
        }));
      }
      return data;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw new ApiError(error.name === "AbortError"
        ? "Request timed out. Refresh the current state before trying that action again."
        : "Cannot reach the game server. Check your connection and the configured API address.");
    } finally { clearTimeout(timeout); }
  }
  window.GameApi = Object.freeze({request, clearSession, baseUrl: base, ApiError, liveToken: token,
    docsUrl: new URL("../docs", base + "/").href});
})();
