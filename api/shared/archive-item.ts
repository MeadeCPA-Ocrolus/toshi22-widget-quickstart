/**
 * Archive one bank connection (item) and everything under it.
 *
 * Used by "remove bank connection" and by "Delete Client", so both do exactly
 * the same thing. Nothing is physically deleted: rows are flagged.
 *
 * What it does, in order:
 *   1. Optionally tells Plaid to disconnect the item (never throws; the result
 *      says what happened so the caller can warn the user).
 *   2. items.is_archived = 1  (the one meaning of "archived" for a connection)
 *   3. accounts: is_active = 0, closed_at = now
 *   4. transactions, holdings, investment transactions, credit / student /
 *      mortgage liabilities under the item: archived (archive_reason is set)
 *
 * Not touched: webhook_log (audit trail), link tokens, items.status.
 *
 * @module shared/archive-item
 */

import { Context } from '@azure/functions';
import { executeQuery } from './database';
import { decrypt } from './encryption';
import { redact } from './safe-log';
import { archiveInvestmentsForItem } from './investments-sync-service';
import { archiveLiabilitiesForItem } from './liabilities-sync-service';

export type PlaidRemovalResult =
    | 'not_requested' // caller did not ask for Plaid removal
    | 'removed'       // Plaid disconnected it (or had already forgotten it)
    | 'failed'        // Plaid could not be reached or refused; connection may still be open
    | 'no_token';     // we have no usable token, so Plaid could not be told

export interface ArchiveItemResult {
    found: boolean;
    itemId: number;
    plaidItemId?: string;
    institutionName?: string | null;
    plaidRemoval: PlaidRemovalResult;
    accounts: number;
    transactions: number;
}

interface ItemRow {
    item_id: number;
    plaid_item_id: string;
    institution_name: string | null;
    access_token: Buffer | null;
    access_token_key_id: number | null;
}

/** Plaid answers these when the item is already gone, which is what we wanted. */
const ALREADY_GONE_CODES = ['ITEM_NOT_FOUND', 'INVALID_ACCESS_TOKEN'];

function plaidErrorCode(err: unknown): string | undefined {
    return (err as any)?.response?.data?.error_code;
}

async function removeFromPlaid(context: Context, item: ItemRow): Promise<PlaidRemovalResult> {
    if (!item.access_token || !item.access_token_key_id) {
        context.log.warn(`No access token stored for item ${item.item_id}; cannot remove from Plaid`);
        return 'no_token';
    }
    try {
        const accessToken = await decrypt(item.access_token, item.access_token_key_id);
        // Imported here to avoid a circular import, as the item endpoint always did.
        const { getPlaidClient } = await import('./plaid-client');
        await getPlaidClient().itemRemove({ access_token: accessToken });
        context.log(`Removed item from Plaid: ${item.plaid_item_id}`);
        return 'removed';
    } catch (err) {
        const code = plaidErrorCode(err);
        if (code && ALREADY_GONE_CODES.includes(code)) {
            context.log(`Plaid no longer knows item ${item.plaid_item_id} (${code}); treating as removed`);
            return 'removed';
        }
        // Log but do not fail: we still want to clean up our own database.
        context.log.warn(`Failed to remove item ${item.item_id} from Plaid: ${redact(err)}`);
        return 'failed';
    }
}

export async function archiveItem(
    context: Context,
    itemId: number,
    options: { removeFromPlaid: boolean; reason: string }
): Promise<ArchiveItemResult> {
    const itemResult = await executeQuery<ItemRow>(
        `SELECT item_id, plaid_item_id, institution_name, access_token, access_token_key_id
         FROM items
         WHERE item_id = @itemId AND is_archived = 0`,
        { itemId }
    );

    if (itemResult.recordset.length === 0) {
        return { found: false, itemId, plaidRemoval: 'not_requested', accounts: 0, transactions: 0 };
    }
    const item = itemResult.recordset[0];

    // Plaid first, while we still have the token.
    const plaidRemoval: PlaidRemovalResult = options.removeFromPlaid
        ? await removeFromPlaid(context, item)
        : 'not_requested';

    await executeQuery(
        `UPDATE items SET is_archived = 1, updated_at = GETDATE() WHERE item_id = @itemId`,
        { itemId }
    );

    const accountsResult = await executeQuery(
        `UPDATE accounts SET is_active = 0, closed_at = GETDATE(), updated_at = GETDATE()
         WHERE item_id = @itemId AND is_active = 1`,
        { itemId }
    );
    const accounts = accountsResult?.rowsAffected?.[0] ?? 0;

    let transactions = 0;
    try {
        const txResult = await executeQuery(
            `UPDATE t SET t.is_archived = 1, t.archived_at = GETDATE(), t.archive_reason = @reason,
                          t.updated_at = GETDATE()
             FROM transactions t
             JOIN accounts a ON t.account_id = a.account_id
             WHERE a.item_id = @itemId AND t.is_archived = 0`,
            { itemId, reason: options.reason }
        );
        transactions = txResult?.rowsAffected?.[0] ?? 0;
    } catch (err) {
        context.log.warn(`Could not archive transactions for item ${itemId}: ${redact(err)}`);
    }

    try {
        await archiveInvestmentsForItem(itemId, options.reason);
    } catch (err) {
        context.log.warn(`Could not archive investments for item ${itemId}: ${redact(err)}`);
    }
    try {
        await archiveLiabilitiesForItem(itemId, options.reason);
    } catch (err) {
        context.log.warn(`Could not archive liabilities for item ${itemId}: ${redact(err)}`);
    }

    return {
        found: true,
        itemId,
        plaidItemId: item.plaid_item_id,
        institutionName: item.institution_name,
        plaidRemoval,
        accounts,
        transactions,
    };
}

/** One sentence for the user when Plaid could not be told to disconnect. */
export function plaidWarning(failedOrMissing: number): string | undefined {
    if (failedOrMissing <= 0) return undefined;
    const what = failedOrMissing === 1 ? '1 bank connection' : `${failedOrMissing} bank connections`;
    return `${what} could not be disconnected at Plaid. It was removed here, but may still be open at Plaid and may need to be removed in the Plaid dashboard.`;
}
