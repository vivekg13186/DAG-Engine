// Auth state for the frontend.
//
// Implementation choice: plain Vue reactive() instead of Pinia. The
// app didn't have Pinia as a dep before this work, and the auth
// surface is small (a token + a user object + four actions). Keeping
// it dependency-free saves ~30 KB and one decision point.
//
// What lives here:
//   • state.token          access JWT, in memory only (NOT localStorage —
//                          xss-resistant; the refresh-token cookie
//                          handles persistence across reloads).
//   • state.user           { id, email, role, workspaceId, status }
//   • state.ready          true once we've tried at least one /auth/me
//                          (used by router guards to wait for boot).
//   • login / logout / fetchMe / tryRefresh — async methods.
//
// Boot sequence:
//   On app load there's no token in memory. We hit POST /auth/refresh
//   blindly — the browser will send the daisy_rt httpOnly cookie if
//   one exists. If refresh succeeds, we land in `ready` with a token
//   and user object; if not, `ready` flips with `user=null` and the
//   router redirects to /login.

import { reactive } from "vue";
import axios from "axios";

// A bare axios for /auth/* — separate instance so the request
// interceptor on the main `api` client can't recurse through it
// (e.g. a refresh fetch triggering its own 401-refresh dance).
const authApi = axios.create({
  baseURL: "/api",
  withCredentials: true,    // send the daisy_rt cookie on /auth/refresh
});

export const auth = reactive({
  token: null,
  user:  null,
  ready: false,             // boot probe complete

  /** True iff a logged-in user is loaded. */
  get isAuthenticated() {
    return !!(this.token && this.user);
  },

  /** Login with email + password. On success the access token + user
   *  are placed in state and the refresh cookie is set by the server. */
  async login(email, password) {
    const { data } = await authApi.post("/auth/login", { email, password });
    this.token = data.accessToken;
    this.user  = data.user;
    return data.user;
  },

  /** Send the existing refresh cookie to /auth/refresh, get a fresh
   *  access token + rotated cookie. Returns the new user or null. */
  async tryRefresh() {
    try {
      const { data } = await authApi.post("/auth/refresh");
      this.token = data.accessToken;
      this.user  = data.user;
      return data.user;
    } catch {
      this.token = null;
      this.user  = null;
      return null;
    }
  },

  /** Probe /auth/me with the current access token. Used after
   *  login to confirm the token works and after refresh-on-401
   *  to repopulate the user object. */
  async fetchMe() {
    if (!this.token) return null;
    try {
      const { data } = await authApi.get("/auth/me", {
        headers: { Authorization: `Bearer ${this.token}` },
      });
      this.user = data;
      return data;
    } catch {
      this.token = null;
      this.user  = null;
      return null;
    }
  },

  /** Best-effort logout — revokes the refresh cookie server-side
   *  and clears local state. Idempotent on the server. */
  async logout() {
    try { await authApi.post("/auth/logout"); }
    catch { /* ignore — we still want to clear local state */ }
    this.token = null;
    this.user  = null;
  },

  /** Boot probe — tries to silently restore a session via the
   *  refresh cookie. Always sets `ready=true` when done so the
   *  router guard can stop waiting. */
  async boot() {
    await this.tryRefresh();
    this.ready = true;
  },

  /** Convenience: returns true if the current user has any of the
   *  given roles. Used in templates and route guards. */
  hasRole(...roles) {
    if (!this.user) return false;
    return roles.includes(this.user.role);
  },
});

/** Discovery: which login methods does the backend offer? Used by
 *  LoginPage to optionally render an SSO button. */
export async function loadAuthConfig() {
  try {
    const { data } = await authApi.get("/auth/config");
    return data;   // { localEnabled, oidcEnabled, oidcLabel }
  } catch {
    return { localEnabled: true, oidcEnabled: false };
  }
}
