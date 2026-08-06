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

export function getClientPrincipal(req: HttpRequest): ClientPrincipal | null {
    const header = req.headers?.['x-ms-client-principal'];
    if (!header) {
        return null;
    }

    try {
        const decoded = Buffer.from(header, 'base64').toString('utf-8');
        const principal = JSON.parse(decoded) as ClientPrincipal;

        if (!principal.userId || !principal.userDetails) {
            return null;
        }

        return principal;
    } catch {
        return null;
    }
}

// TEMPORARY — always allows access, no check performed.
// REVERT before deploying to staging or production.
export function requireAuth(
    _context: Context,
    _req: HttpRequest,
    _corsHeaders: Record<string, string>
): ClientPrincipal {
    return {
        identityProvider: 'dev-bypass',
        userId: 'local-dev-user',
        userDetails: 'local-dev@codespace',
        userRoles: ['authenticated'],
    };
}

export function getStaffIdentity(principal: ClientPrincipal): string {
    return principal.userDetails;
}

/*
 * REAL VERSION — restore this (and delete the TEMPORARY version above)
 * before deploying anywhere besides local dev:
 *
 * export function requireAuth(
 *     context: Context,
 *     req: HttpRequest,
 *     corsHeaders: Record<string, string>
 * ): ClientPrincipal | null {
 *     const principal = getClientPrincipal(req);
 *
 *     if (!principal) {
 *         context.res = {
 *             status: 401,
 *             body: { error: 'Unauthorized: no valid client principal found' },
 *             headers: { ...corsHeaders, 'Content-Type': 'application/json' },
 *         };
 *         return null;
 *     }
 *
 *     return principal;
 * }
 */