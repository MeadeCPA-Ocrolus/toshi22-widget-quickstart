/**
 * Auth utility — TEMPORARILY DISABLED FOR LOCAL TESTING
 *
 * requireAuth() currently allows every request through without checking
 * anything. This must be reverted to a real check before deploying to
 * staging or production — see the commented-out version at the bottom
 * of this file for the version to restore.
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
export declare function requireAuth(_context: Context, _req: HttpRequest, _corsHeaders: Record<string, string>): ClientPrincipal;
export declare function getStaffIdentity(principal: ClientPrincipal): string;
//# sourceMappingURL=auth.d.ts.map