/**
 * Auth utility — in-code principal check
 *
 * The Entra edge gate in staticwebapp.config.json is the first lock on
 * /api/*. This is the second, independent lock: every Function reads the
 * x-ms-client-principal header itself and rejects requests without one.
 *
 * @module shared/auth
 */
import { Context, HttpRequest } from '@azure/functions';
export interface ClientPrincipal {
    identityProvider: string;
    userId: string;
    userDetails: string;
    userRoles: string[];
}
export declare function getClientPrincipal(req: HttpRequest): ClientPrincipal | null;
export declare function requireAuth(context: Context, req: HttpRequest, corsHeaders: Record<string, string>): ClientPrincipal | null;
export declare function getStaffIdentity(principal: ClientPrincipal): string;
//# sourceMappingURL=auth.d.ts.map