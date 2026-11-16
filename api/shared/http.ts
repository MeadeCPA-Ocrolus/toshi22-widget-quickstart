/**
 * Shared HTTP response helpers
 *
 * - CORS origin comes from the ALLOWED_ORIGIN setting instead of a hardcoded '*'.
 * - Server errors return a generic message plus a correlation id. The real
 *   details go to the logs only (factory items F-12, F-18, F-19).
 *
 * @module shared/http
 */

import { Context } from '@azure/functions';
import { logError, newCorrelationId } from './safe-log';

/**
 * Returns the Access-Control-Allow-Origin header to spread into a corsHeaders object.
 *
 * - ALLOWED_ORIGIN set: that exact origin is allowed.
 * - Not set on a deployed app: no CORS header at all (same-origin only). The
 *   frontend and API share one origin on Static Web Apps, so this is the safe default.
 * - Not set locally (not deployed): '*' so local development keeps working.
 */
export function allowOriginHeader(): Record<string, string> {
    const configured = process.env.ALLOWED_ORIGIN;
    if (configured) {
        return { 'Access-Control-Allow-Origin': configured, Vary: 'Origin' };
    }
    const isDeployed = !!process.env.WEBSITE_INSTANCE_ID;
    return isDeployed ? {} : { 'Access-Control-Allow-Origin': '*' };
}

/**
 * Sets a generic 500 response and logs the real error safely.
 * The browser gets only a message and a correlation id it can quote to support.
 */
export function serverError(
    context: Context,
    label: string,
    err: unknown,
    corsHeaders: Record<string, string>,
    publicMessage = 'Internal server error'
): void {
    const correlationId = newCorrelationId();
    logError(context, label, err, correlationId);
    context.res = {
        status: 500,
        body: { error: publicMessage, correlationId },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}
