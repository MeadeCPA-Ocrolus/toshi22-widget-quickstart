/**
 * Plaid Webhook Handler
 * 
 * Receives webhooks from Plaid and logs them for processing.
 * Implements idempotency to handle duplicate webhook deliveries.
 * 
 * Endpoint: POST /api/plaid/webhook
 * 
 * @module plaid-webhook
 */

import { AzureFunction, Context, HttpRequest } from '@azure/functions';
import { executeQuery } from '../shared/database';

/**
 * Plaid webhook payload structure
 */
interface PlaidWebhook {
    webhook_type: string;
    webhook_code: string;
    item_id?: string;
    error?: {
        error_type: string;
        error_code: string;
        error_message: string;
    };
    new_transactions?: number;
    removed_transactions?: string[];
    consent_expiration_time?: string;
    // SESSION_FINISHED specific fields
    public_token?: string;
    status?: string;
    link_session_id?: string;
    link_token?: string;
}

/**
 * Result of looking up an item by plaid_item_id
 */
interface ItemLookup {
    item_id: number;
}

/**
 * Generate a unique webhook ID for idempotency
 * Plaid doesn't always send a unique ID, so we create one from the payload
 */
function generateWebhookId(webhook: PlaidWebhook, timestamp: Date): string {
    // Create a deterministic ID from webhook content
    const components = [
        webhook.webhook_type,
        webhook.webhook_code,
        webhook.item_id || 'no-item',
        webhook.link_session_id || '',
        timestamp.toISOString().substring(0, 16), // Minute-level granularity
    ];
    
    // Simple hash - in production you might use crypto.createHash
    const str = components.join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    
    return `wh_${Math.abs(hash).toString(16)}_${Date.now()}`;
}

/**
 * Log the webhook to the database
 * Returns true if this is a new webhook, false if duplicate
 */
async function logWebhook(
    context: Context,
    webhook: PlaidWebhook,
    webhookId: string
): Promise<{ isNew: boolean; logId?: number }> {
    // Check for duplicate (idempotency)
    const existingResult = await executeQuery<{ log_id: number }>(
        `SELECT log_id FROM webhook_log WHERE webhook_id = @webhookId`,
        { webhookId }
    );

    if (existingResult.recordset.length > 0) {
        context.log.warn(`Duplicate webhook received: ${webhookId}`);
        return { isNew: false, logId: existingResult.recordset[0].log_id };
    }

    // Look up our internal item_id if plaid_item_id is provided
    let internalItemId: number | null = null;
    if (webhook.item_id) {
        const itemResult = await executeQuery<ItemLookup>(
            `SELECT item_id FROM items WHERE plaid_item_id = @plaidItemId`,
            { plaidItemId: webhook.item_id }
        );
        if (itemResult.recordset.length > 0) {
            internalItemId = itemResult.recordset[0].item_id;
        }
    }

    // Insert the webhook log
    const insertResult = await executeQuery<{ log_id: number }>(
        `INSERT INTO webhook_log (
            webhook_type, 
            webhook_code, 
            item_id, 
            plaid_item_id, 
            payload, 
            webhook_id,
            processed,
            created_at
        )
        OUTPUT INSERTED.log_id
        VALUES (
            @webhookType,
            @webhookCode,
            @itemId,
            @plaidItemId,
            @payload,
            @webhookId,
            0,
            GETDATE()
        )`,
        {
            webhookType: webhook.webhook_type,
            webhookCode: webhook.webhook_code,
            itemId: internalItemId,
            plaidItemId: webhook.item_id || null,
            payload: JSON.stringify(webhook),
            webhookId,
        }
    );

    return { isNew: true, logId: insertResult.recordset[0].log_id };
}

/**
 * Update item status based on webhook code
 */
async function updateItemStatus(
    context: Context,
    webhook: PlaidWebhook
): Promise<void> {
    if (!webhook.item_id) return;

    let newStatus: string | null = null;
    let errorCode: string | null = null;
    let errorMessage: string | null = null;

    switch (webhook.webhook_code) {
        // Item needs re-authentication
        case 'ITEM_LOGIN_REQUIRED':
        case 'PENDING_EXPIRATION':
        case 'PENDING_DISCONNECT':
            newStatus = 'login_required';
            break;

        // Item error occurred
        case 'ITEM_ERROR':
            newStatus = 'error';
            if (webhook.error) {
                errorCode = webhook.error.error_code;
                errorMessage = webhook.error.error_message;
            }
            break;

        // Login was repaired
        case 'LOGIN_REPAIRED':
            newStatus = 'active';
            // Clear any previous errors
            errorCode = null;
            errorMessage = null;
            break;

        // User revoked access
        case 'USER_PERMISSION_REVOKED':
            newStatus = 'archived';
            break;

        // New transactions available - set the sync flag
        case 'SYNC_UPDATES_AVAILABLE':
            await executeQuery(
                `UPDATE items 
                 SET has_sync_updates = 1, updated_at = GETDATE()
                 WHERE plaid_item_id = @plaidItemId`,
                { plaidItemId: webhook.item_id }
            );
            context.log(`Set has_sync_updates flag for item: ${webhook.item_id}`);
            return;

        // New accounts available - flag for update mode
        case 'NEW_ACCOUNTS_AVAILABLE':
            newStatus = 'needs_update';
            break;

        default:
            // No status change needed
            return;
    }

    if (newStatus) {
        await executeQuery(
            `UPDATE items 
             SET status = @status,
                 last_error_code = @errorCode,
                 last_error_message = @errorMessage,
                 last_error_timestamp = CASE WHEN @errorCode IS NOT NULL THEN GETDATE() ELSE last_error_timestamp END,
                 consent_expiration_time = @consentExpiration,
                 updated_at = GETDATE()
             WHERE plaid_item_id = @plaidItemId`,
            {
                status: newStatus,
                errorCode,
                errorMessage,
                consentExpiration: webhook.consent_expiration_time || null,
                plaidItemId: webhook.item_id,
            }
        );
        context.log(`Updated item ${webhook.item_id} status to: ${newStatus}`);
    }
}

/**
 * Handle SESSION_FINISHED webhook (Hosted Link completion)
 * This is called when a user completes the Plaid Link flow
 */
async function handleSessionFinished(
    context: Context,
    webhook: PlaidWebhook
): Promise<void> {
    context.log('SESSION_FINISHED webhook received');
    
    // The public_token will be exchanged in Sprint 2
    // For now, just log that we received it
    if (webhook.public_token) {
        context.log(`Received public_token for link_token: ${webhook.link_token}`);
        
        // Update link_token status to 'used'
        if (webhook.link_token) {
            await executeQuery(
                `UPDATE link_tokens 
                 SET status = 'used', used_at = GETDATE()
                 WHERE link_token = @linkToken`,
                { linkToken: webhook.link_token }
            );
        }
    }
    
    // TODO (Sprint 2): Exchange public_token for access_token
    // This will be implemented when we build the token exchange flow
}

/**
 * Mark webhook as processed
 */
async function markWebhookProcessed(
    logId: number,
    errorMessage?: string
): Promise<void> {
    await executeQuery(
        `UPDATE webhook_log 
         SET processed = 1, 
             processed_at = GETDATE(),
             error_message = @errorMessage
         WHERE log_id = @logId`,
        { logId, errorMessage: errorMessage || null }
    );
}

/**
 * Main webhook handler function
 */
const httpTrigger: AzureFunction = async function (
    context: Context,
    req: HttpRequest
): Promise<void> {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Plaid-Verification',
    };

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        context.res = { status: 200, headers: corsHeaders };
        return;
    }

    // Only accept POST
    if (req.method !== 'POST') {
        context.res = {
            status: 405,
            body: { error: 'Method not allowed' },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
        return;
    }

    context.log('Plaid webhook received');

    try {
        const webhook = req.body as PlaidWebhook;

        // Validate required fields
        if (!webhook.webhook_type || !webhook.webhook_code) {
            context.res = {
                status: 400,
                body: { error: 'Missing webhook_type or webhook_code' },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        context.log(`Webhook: ${webhook.webhook_type} / ${webhook.webhook_code}`);
        if (webhook.item_id) {
            context.log(`Item ID: ${webhook.item_id}`);
        }

        // Generate webhook ID and log it
        const webhookId = generateWebhookId(webhook, new Date());
        const { isNew, logId } = await logWebhook(context, webhook, webhookId);

        if (!isNew) {
            // Duplicate webhook - acknowledge but don't process
            context.res = {
                status: 200,
                body: { 
                    status: 'duplicate',
                    message: 'Webhook already processed',
                    webhook_id: webhookId,
                },
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            };
            return;
        }

        // Process the webhook based on type/code
        let processingError: string | undefined;

        try {
            // Handle item status updates
            if (webhook.webhook_type === 'ITEM') {
                await updateItemStatus(context, webhook);
            }

            // Handle transaction webhooks
            if (webhook.webhook_type === 'TRANSACTIONS') {
                if (webhook.webhook_code === 'SYNC_UPDATES_AVAILABLE') {
                    await updateItemStatus(context, webhook);
                }
                // Other transaction webhook handling will be in Sprint 3
            }

            // Handle Hosted Link completion
            if (webhook.webhook_type === 'LINK' && webhook.webhook_code === 'SESSION_FINISHED') {
                await handleSessionFinished(context, webhook);
            }

        } catch (err) {
            processingError = err instanceof Error ? err.message : String(err);
            context.log.error(`Error processing webhook: ${processingError}`);
        }

        // Mark as processed
        if (logId) {
            await markWebhookProcessed(logId, processingError);
        }

        // Always return 200 to Plaid (even on processing errors)
        // This prevents Plaid from retrying - we've logged the webhook
        context.res = {
            status: 200,
            body: {
                status: processingError ? 'error' : 'success',
                message: processingError || 'Webhook processed',
                webhook_id: webhookId,
                log_id: logId,
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };

    } catch (err) {
        context.log.error('Webhook handler error:', err);
        
        // Return 500 only for critical errors (DB connection, etc.)
        // Plaid will retry these
        context.res = {
            status: 500,
            body: { 
                error: 'Internal server error',
                message: err instanceof Error ? err.message : 'Unknown error',
            },
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        };
    }
};

export default httpTrigger;