"use strict";
/**
 * Auth utility — in-code principal check
 *
 * The Entra edge gate in staticwebapp.config.json is the first lock on
 * /api/*. This is the second, independent lock: every Function reads the
 * x-ms-client-principal header itself and rejects requests without one.
 *
 * @module shared/auth
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getClientPrincipal = getClientPrincipal;
exports.requireAuth = requireAuth;
exports.getStaffIdentity = getStaffIdentity;
function getClientPrincipal(req) {
    const header = req.headers?.['x-ms-client-principal'];
    if (!header) {
        return null;
    }
    try {
        const decoded = Buffer.from(header, 'base64').toString('utf-8');
        const principal = JSON.parse(decoded);
        if (!principal.userId || !principal.userDetails) {
            return null;
        }
        return principal;
    }
    catch {
        return null;
    }
}
/**
 * Local-dev-only bypass. Requires BOTH:
 *   1. Not running as a real deployed Function App (AZURE_FUNCTIONS_ENVIRONMENT
 *      is either unset or 'Development' — Azure always sets this on deployed apps).
 *   2. ALLOW_DEV_AUTH_BYPASS === 'true' — must be explicitly set in your own
 *      local.settings.json. Never set as a real App Setting anywhere deployed.
 */
function isDevBypassActive() {
    const isRunningInAzure = !!process.env.WEBSITE_INSTANCE_ID;
    return !isRunningInAzure && process.env.ALLOW_DEV_AUTH_BYPASS === 'true';
}
function requireAuth(context, req, corsHeaders) {
    const principal = getClientPrincipal(req);
    if (principal) {
        return principal;
    }
    if (isDevBypassActive()) {
        context.log.warn('AUTH BYPASSED — local dev only. This must never be true on a deployed environment.');
        return {
            identityProvider: 'dev-bypass',
            userId: 'local-dev-user',
            userDetails: 'local-dev@codespace',
            userRoles: ['authenticated'],
        };
    }
    context.res = {
        status: 401,
        body: { error: 'Unauthorized: no valid client principal found' },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
    return null;
}
function getStaffIdentity(principal) {
    return principal.userDetails;
}
//# sourceMappingURL=auth.js.map