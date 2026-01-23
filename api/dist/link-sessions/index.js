"use strict";
/**
 * Link Sessions Endpoint
 *
 * GET /api/link-sessions - List all link tokens with status
 * GET /api/link-sessions?needsAction=true - Only links needing CPA attention
 * GET /api/link-sessions?clientId=3 - Links for specific client
 *
 * Note: The link_token table uses link_token (the string) as the primary key,
 *       NOT a separate link_token_id column.
 *
 * This endpoint helps CPAs see:
 * - Failed link attempts (client exited, didn't complete, etc.)
 * - Expired links that need to be resent
 * - Pending links that haven't been used yet
 *
 * @module link-sessions
 */
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("../shared/database");
/**
 * Session history record
 * interface LinkSessionRecord {
    session_id: number;
    link_token: string;  // FK to link_tokens.link_token
    link_session_id: string | null;
    status: string;
    error_code: string | null;
    error_message: string | null;
    error_type: string | null;
    institution_id: string | null;
    institution_name: string | null;
    created_at: string;
}
 */
/**
 * CORS headers for all responses
 */
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};
/**
 * Main HTTP trigger handler
 */
const httpTrigger = async function (context, req) {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }
    try {
        // List all link tokens with optional filters
        await listLinkTokens(context, req);
    }
    catch (error) {
        context.log.error('Link sessions endpoint error:', error);
        context.res = {
            status: 500,
            body: {
                error: 'Internal server error',
                message: error instanceof Error ? error.message : 'Unknown error',
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};
/**
 * List link tokens with filtering options
 *
 * Query params:
 * - clientId: Filter by client
 * - status: pending, failed, expired, used
 * - needsAction: true to show only links needing CPA attention
 * - days: How many days back to look (default 7)
 */
async function listLinkTokens(context, req) {
    const clientId = req.query?.clientId;
    const status = req.query?.status; // pending, failed, expired, used
    const needsAction = req.query?.needsAction === 'true';
    const days = parseInt(req.query?.days || '7', 10);
    context.log(`Listing link tokens: clientId=${clientId}, status=${status}, needsAction=${needsAction}, days=${days}`);
    let whereClause = 'WHERE lt.created_at > DATEADD(DAY, -@days, GETDATE())';
    const params = { days };
    if (clientId) {
        whereClause += ' AND lt.client_id = @clientId';
        params.clientId = parseInt(clientId, 10);
    }
    if (status) {
        switch (status) {
            case 'pending':
                whereClause += " AND lt.status = 'pending' AND lt.expires_at > GETDATE()";
                break;
            case 'failed':
                whereClause += " AND lt.last_session_status IS NOT NULL AND lt.last_session_status != 'SUCCESS' AND lt.status != 'used'";
                break;
            case 'expired':
                whereClause += " AND lt.expires_at < GETDATE() AND lt.status != 'used'";
                break;
            case 'used':
                whereClause += " AND lt.status = 'used'";
                break;
        }
    }
    if (needsAction) {
        // Filter to only show links that need CPA action
        whereClause += ` AND (
            (lt.expires_at < GETDATE() AND lt.status != 'used')  -- Expired
            OR (lt.last_session_status IN ('EXITED', 'REQUIRES_CREDENTIALS', 'REQUIRES_QUESTIONS', 'REQUIRES_SELECTIONS'))  -- User didn't complete
            OR (lt.last_session_status IS NOT NULL AND lt.last_session_status != 'SUCCESS' AND lt.status != 'used')  -- Other failures
        )`;
    }
    const query = `
        SELECT 
            lt.link_token,
            lt.client_id,
            c.first_name + ' ' + c.last_name AS client_name,
            c.email AS client_email,
            lt.hosted_link_url,
            lt.status,
            lt.last_session_status,
            lt.last_session_error_code,
            lt.last_session_error_message,
            ISNULL(lt.attempt_count, 0) AS attempt_count,
            lt.created_at,
            lt.expires_at,
            lt.used_at,
            CASE 
                WHEN lt.status = 'used' THEN 'completed'
                WHEN lt.expires_at < GETDATE() THEN 'expired'
                WHEN lt.last_session_status IN ('EXITED', 'REQUIRES_CREDENTIALS', 'REQUIRES_QUESTIONS', 'REQUIRES_SELECTIONS') THEN 'resend_link'
                WHEN lt.last_session_status = 'INSTITUTION_NOT_SUPPORTED' THEN 'contact_client'
                WHEN lt.last_session_status IS NOT NULL AND lt.last_session_status != 'SUCCESS' THEN 'investigate'
                WHEN lt.status = 'pending' THEN 'waiting'
                ELSE 'unknown'
            END AS action_needed
        FROM link_tokens lt
        JOIN clients c ON lt.client_id = c.client_id
        ${whereClause}
        ORDER BY 
            CASE 
                WHEN lt.status = 'used' THEN 3
                WHEN lt.expires_at < GETDATE() THEN 2
                WHEN lt.last_session_status IS NOT NULL AND lt.last_session_status != 'SUCCESS' THEN 1
                ELSE 4
            END,
            lt.created_at DESC
    `;
    const result = await (0, database_1.executeQuery)(query, params);
    // Group by action needed for summary
    const summary = {
        total: result.recordset.length,
        needsResend: result.recordset.filter(r => r.action_needed === 'resend_link').length,
        expired: result.recordset.filter(r => r.action_needed === 'expired').length,
        waiting: result.recordset.filter(r => r.action_needed === 'waiting').length,
        completed: result.recordset.filter(r => r.action_needed === 'completed').length,
    };
    // Add recommendation for each link token
    const linkTokensWithRecommendations = result.recordset.map(lt => ({
        ...lt,
        recommendation: getActionRecommendation(lt),
    }));
    context.res = {
        status: 200,
        body: {
            linkTokens: linkTokensWithRecommendations,
            summary,
            filters: { clientId, status, needsAction, days },
        },
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    };
}
/**
 * Get recommended action based on link token status
 */
function getActionRecommendation(linkToken) {
    if (linkToken.action_needed === 'completed') {
        return {
            action: 'none',
            message: 'Link completed successfully. Bank account connected.',
            canResend: false,
        };
    }
    if (linkToken.action_needed === 'expired') {
        return {
            action: 'resend',
            message: 'Link has expired. Create a new link for the client.',
            canResend: true,
        };
    }
    if (linkToken.action_needed === 'resend_link') {
        const reason = linkToken.last_session_status;
        let message = 'Client did not complete the link process. ';
        switch (reason) {
            case 'EXITED':
                message += 'They exited before finishing. Consider following up with them.';
                break;
            case 'REQUIRES_CREDENTIALS':
                message += 'They did not enter their bank credentials. Make sure they have their login ready.';
                break;
            case 'REQUIRES_QUESTIONS':
                message += 'They did not answer security questions. They may need to check their bank for verification codes.';
                break;
            case 'REQUIRES_SELECTIONS':
                message += 'They did not select which accounts to connect.';
                break;
            default:
                message += 'Reason: ' + reason;
        }
        return {
            action: 'resend',
            message,
            canResend: true,
        };
    }
    if (linkToken.action_needed === 'contact_client') {
        return {
            action: 'contact',
            message: 'The bank the client tried to connect is not supported. Contact them to discuss alternatives.',
            canResend: false,
        };
    }
    if (linkToken.action_needed === 'investigate') {
        return {
            action: 'investigate',
            message: `An error occurred: ${linkToken.last_session_error_code || linkToken.last_session_status}. Check the error details.`,
            canResend: true,
        };
    }
    if (linkToken.action_needed === 'waiting') {
        const expiresAt = new Date(linkToken.expires_at);
        const now = new Date();
        const hoursRemaining = Math.round((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60));
        return {
            action: 'wait',
            message: `Link is active and waiting for client. Expires in ${hoursRemaining} hours.`,
            canResend: false,
        };
    }
    return {
        action: 'unknown',
        message: 'Unable to determine status. Check the session details.',
        canResend: true,
    };
}
exports.default = httpTrigger;
//# sourceMappingURL=index.js.map