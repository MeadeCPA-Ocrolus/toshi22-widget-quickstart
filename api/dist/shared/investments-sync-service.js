"use strict";
/**
 * Investments Sync Service
 *
 * Fetches investment data from Plaid and syncs to database.
 * Handles holdings, securities, and investment transactions.
 *
 * Key differences from regular transactions:
 * - Uses /investments/holdings/get for current positions
 * - Uses /investments/transactions/get for historical activity (offset-based, not cursor)
 * - Securities are stored globally (deduplicated by plaid_security_id)
 * - Both holdings AND transactions sync automatically on SESSION_FINISHED
 *
 * @module shared/investments-sync-service
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncInvestmentsForItem = syncInvestmentsForItem;
exports.syncHoldingsOnly = syncHoldingsOnly;
exports.archiveInvestmentsForItem = archiveInvestmentsForItem;
exports.archiveInvestmentsForAccounts = archiveInvestmentsForAccounts;
const database_1 = require("./database");
// ============================================================================
// Main Sync Functions
// ============================================================================
/**
 * Sync all investment data for an item (holdings + transactions)
 * Called on SESSION_FINISHED and on webhook updates
 */
async function syncInvestmentsForItem(plaidClient, itemId, accessToken, context) {
    const result = {
        success: false,
        item_id: itemId,
        holdings: { added: 0, updated: 0, removed: 0 },
        securities: { added: 0, updated: 0 },
        transactions: { added: 0, updated: 0 },
    };
    try {
        context.log(`Syncing investments for item ${itemId}`);
        // 1. Get account mapping (plaid_account_id → our account_id)
        const accountMap = await getAccountMapping(itemId);
        if (accountMap.size === 0) {
            context.log.warn(`No active accounts found for item ${itemId}`);
            result.error = 'No active accounts';
            return result;
        }
        // 2. Sync holdings (also returns securities)
        const holdingsResult = await syncHoldings(plaidClient, accessToken, itemId, accountMap, context);
        result.holdings = holdingsResult.holdings;
        result.securities = holdingsResult.securities;
        // 3. Sync investment transactions
        const transactionsResult = await syncInvestmentTransactions(plaidClient, accessToken, itemId, accountMap, context);
        result.transactions = transactionsResult;
        // 4. Update item's last sync time and clear error
        await (0, database_1.executeQuery)(`UPDATE items 
             SET investments_last_successful_update = GETDATE(), 
                 investments_error_code = NULL,
                 updated_at = GETDATE() 
             WHERE item_id = @itemId`, { itemId });
        result.success = true;
        context.log(`Investments sync complete for item ${itemId}: ${result.holdings.added} holdings added, ${result.transactions.added} transactions added`);
    }
    catch (err) {
        context.log.error(`Investments sync failed for item ${itemId}:`, err);
        const plaidErrorCode = err.response?.data?.error_code;
        if (plaidErrorCode === 'PRODUCTS_NOT_SUPPORTED') {
            result.error = 'PRODUCTS_NOT_SUPPORTED';
            await (0, database_1.executeQuery)(`UPDATE items SET investments_error_code = @errorCode, updated_at = GETDATE() WHERE item_id = @itemId`, { itemId, errorCode: 'PRODUCTS_NOT_SUPPORTED' });
            context.log(`Investments sync: Institution does not support investments product`);
        }
        else {
            result.error = plaidErrorCode || err.message || 'Unknown error';
            if (plaidErrorCode) {
                await (0, database_1.executeQuery)(`UPDATE items SET investments_error_code = @errorCode, updated_at = GETDATE() WHERE item_id = @itemId`, { itemId, errorCode: plaidErrorCode });
            }
        }
    }
    return result;
}
/**
 * Sync only holdings (for HOLDINGS: DEFAULT_UPDATE webhook)
 */
async function syncHoldingsOnly(plaidClient, itemId, accessToken, context) {
    const result = {
        success: false,
        item_id: itemId,
        holdings: { added: 0, updated: 0, removed: 0 },
        securities: { added: 0, updated: 0 },
        transactions: { added: 0, updated: 0 },
    };
    try {
        context.log(`Syncing holdings only for item ${itemId}`);
        const accountMap = await getAccountMapping(itemId);
        if (accountMap.size === 0) {
            result.error = 'No active accounts';
            return result;
        }
        const holdingsResult = await syncHoldings(plaidClient, accessToken, itemId, accountMap, context);
        result.holdings = holdingsResult.holdings;
        result.securities = holdingsResult.securities;
        // Update last sync time
        await (0, database_1.executeQuery)(`UPDATE items 
             SET investments_last_successful_update = GETDATE(), 
                 investments_error_code = NULL,
                 updated_at = GETDATE() 
             WHERE item_id = @itemId`, { itemId });
        result.success = true;
        context.log(`Holdings sync complete for item ${itemId}`);
    }
    catch (err) {
        const plaidErrorCode = err.response?.data?.error_code;
        result.error = plaidErrorCode || err.message || 'Unknown error';
        context.log.error(`Holdings sync failed for item ${itemId}:`, err);
    }
    return result;
}
// ============================================================================
// Holdings Sync
// ============================================================================
async function syncHoldings(plaidClient, accessToken, itemId, accountMap, context) {
    // Call Plaid /investments/holdings/get
    const response = (await plaidClient.investmentsHoldingsGet({
        access_token: accessToken,
    })).data;
    context.log(`Plaid returned: ${response.holdings?.length || 0} holdings, ${response.securities?.length || 0} securities`);
    // 1. Process securities first (so we have security_id for holdings)
    const securitiesStats = await processSecurities(response.securities || [], context);
    // 2. Build security mapping (plaid_security_id → our security_id)
    const securityMap = await getSecurityMapping();
    // 3. Process holdings
    const holdingsStats = await processHoldings(response.holdings || [], accountMap, securityMap, itemId, context);
    return {
        holdings: holdingsStats,
        securities: securitiesStats,
    };
}
async function processSecurities(securities, context) {
    const stats = { added: 0, updated: 0 };
    for (const sec of securities) {
        if (!sec.security_id) {
            context.log.warn('Security missing security_id, skipping');
            continue;
        }
        // Check if security already exists (global table)
        const existing = await (0, database_1.executeQuery)(`SELECT security_id FROM securities WHERE plaid_security_id = @plaidSecurityId`, { plaidSecurityId: sec.security_id });
        if (existing.recordset.length > 0) {
            // UPDATE existing security (market data changes)
            await updateSecurity(existing.recordset[0].security_id, sec);
            stats.updated++;
        }
        else {
            // INSERT new security
            await insertSecurity(sec);
            stats.added++;
        }
    }
    return stats;
}
async function insertSecurity(sec) {
    // Note: Plaid SDK Security type may not have all these properties
    // We use optional chaining and type assertions for safety
    const secAny = sec;
    // Serialize option_contract and fixed_income as JSON strings
    const optionContractJson = secAny.option_contract ? JSON.stringify(secAny.option_contract) : null;
    const fixedIncomeJson = secAny.fixed_income ? JSON.stringify(secAny.fixed_income) : null;
    await (0, database_1.executeQuery)(`INSERT INTO securities (
            plaid_security_id, ticker_symbol, name, isin, cusip,
            institution_security_id, institution_id, proxy_security_id,
            security_type, security_subtype, is_cash_equivalent,
            close_price, close_price_as_of, update_datetime,
            iso_currency_code, unofficial_currency_code, market_identifier_code,
            sector, industry,
            option_contract, fixed_income
        )
        VALUES (
            @plaidSecurityId, @ticker, @name, @isin, @cusip,
            @institutionSecurityId, @institutionId, @proxySecurityId,
            @securityType, @securitySubtype, @isCashEquivalent,
            @closePrice, @closePriceAsOf, @updateDatetime,
            @isoCurrency, @unofficialCurrency, @marketCode,
            @sector, @industry,
            @optionContract, @fixedIncome
        )`, {
        plaidSecurityId: sec.security_id,
        ticker: sec.ticker_symbol,
        name: sec.name,
        isin: sec.isin,
        cusip: sec.cusip,
        institutionSecurityId: sec.institution_security_id,
        institutionId: sec.institution_id,
        proxySecurityId: sec.proxy_security_id,
        securityType: sec.type,
        securitySubtype: secAny.subtype || null,
        isCashEquivalent: sec.is_cash_equivalent ? 1 : 0,
        closePrice: sec.close_price,
        closePriceAsOf: sec.close_price_as_of,
        updateDatetime: sec.update_datetime,
        isoCurrency: sec.iso_currency_code,
        unofficialCurrency: sec.unofficial_currency_code,
        marketCode: secAny.market_identifier_code || null,
        sector: secAny.sector || null,
        industry: secAny.industry || null,
        optionContract: optionContractJson,
        fixedIncome: fixedIncomeJson,
    });
}
async function updateSecurity(securityId, sec) {
    // Note: Plaid SDK Security type may not have all these properties
    // We use optional chaining and type assertions for safety
    const secAny = sec;
    // Serialize option_contract and fixed_income as JSON strings
    const optionContractJson = secAny.option_contract ? JSON.stringify(secAny.option_contract) : null;
    const fixedIncomeJson = secAny.fixed_income ? JSON.stringify(secAny.fixed_income) : null;
    await (0, database_1.executeQuery)(`UPDATE securities SET
            ticker_symbol = @ticker, name = @name, isin = @isin, cusip = @cusip,
            institution_security_id = @institutionSecurityId, institution_id = @institutionId,
            proxy_security_id = @proxySecurityId,
            security_type = @securityType, security_subtype = @securitySubtype,
            is_cash_equivalent = @isCashEquivalent,
            close_price = @closePrice, close_price_as_of = @closePriceAsOf,
            update_datetime = @updateDatetime,
            iso_currency_code = @isoCurrency, unofficial_currency_code = @unofficialCurrency,
            market_identifier_code = @marketCode,
            sector = @sector, industry = @industry,
            option_contract = @optionContract, fixed_income = @fixedIncome,
            updated_at = GETDATE()
        WHERE security_id = @securityId`, {
        securityId,
        ticker: sec.ticker_symbol,
        name: sec.name,
        isin: sec.isin,
        cusip: sec.cusip,
        institutionSecurityId: sec.institution_security_id,
        institutionId: sec.institution_id,
        proxySecurityId: sec.proxy_security_id,
        securityType: sec.type,
        securitySubtype: secAny.subtype || null,
        isCashEquivalent: sec.is_cash_equivalent ? 1 : 0,
        closePrice: sec.close_price,
        closePriceAsOf: sec.close_price_as_of,
        updateDatetime: sec.update_datetime,
        isoCurrency: sec.iso_currency_code,
        unofficialCurrency: sec.unofficial_currency_code,
        marketCode: secAny.market_identifier_code || null,
        sector: secAny.sector || null,
        industry: secAny.industry || null,
        optionContract: optionContractJson,
        fixedIncome: fixedIncomeJson,
    });
}
async function processHoldings(holdings, accountMap, securityMap, itemId, context) {
    const stats = { added: 0, updated: 0, removed: 0 };
    const processedHoldingKeys = []; // account_id + security_id combinations
    for (const holding of holdings) {
        // Get our account_id
        const accountId = accountMap.get(holding.account_id);
        if (!accountId) {
            context.log.warn(`No account mapping for holding account ${holding.account_id}`);
            continue;
        }
        // Get our security_id
        const securityId = securityMap.get(holding.security_id);
        if (!securityId) {
            context.log.warn(`No security mapping for holding security ${holding.security_id}`);
            continue;
        }
        const holdingKey = `${accountId}-${securityId}`;
        processedHoldingKeys.push(holdingKey);
        // Check if holding already exists (by account + security)
        const existing = await (0, database_1.executeQuery)(`SELECT holding_id FROM holdings 
             WHERE account_id = @accountId AND security_id = @securityId AND is_archived = 0`, { accountId, securityId });
        if (existing.recordset.length > 0) {
            // UPDATE existing holding
            await updateHolding(existing.recordset[0].holding_id, holding);
            stats.updated++;
        }
        else {
            // INSERT new holding
            await insertHolding(accountId, securityId, holding, holding.security_id);
            stats.added++;
        }
    }
    // Archive holdings that are no longer present in Plaid response
    // (User sold all shares of a security)
    const archivedCount = await archiveRemovedHoldings(itemId, processedHoldingKeys, context);
    stats.removed = archivedCount;
    return stats;
}
async function insertHolding(accountId, securityId, h, plaidSecurityId) {
    await (0, database_1.executeQuery)(`INSERT INTO holdings (
            account_id, security_id, plaid_account_id, plaid_security_id,
            quantity, institution_price,
            institution_price_as_of, institution_price_datetime,
            institution_value, cost_basis,
            iso_currency_code, unofficial_currency_code,
            vested_quantity, vested_value
        )
        VALUES (
            @accountId, @securityId, @plaidAccountId, @plaidSecurityId,
            @quantity, @institutionPrice,
            @institutionPriceAsOf, @institutionPriceDatetime,
            @institutionValue, @costBasis,
            @isoCurrency, @unofficialCurrency,
            @vestedQuantity, @vestedValue
        )`, {
        accountId,
        securityId,
        plaidAccountId: h.account_id,
        plaidSecurityId,
        quantity: h.quantity,
        institutionPrice: h.institution_price,
        institutionPriceAsOf: h.institution_price_as_of,
        institutionPriceDatetime: h.institution_price_datetime,
        institutionValue: h.institution_value,
        costBasis: h.cost_basis,
        isoCurrency: h.iso_currency_code,
        unofficialCurrency: h.unofficial_currency_code,
        vestedQuantity: h.vested_quantity,
        vestedValue: h.vested_value,
    });
}
async function updateHolding(holdingId, h) {
    await (0, database_1.executeQuery)(`UPDATE holdings SET
            quantity = @quantity, institution_price = @institutionPrice,
            institution_price_as_of = @institutionPriceAsOf,
            institution_price_datetime = @institutionPriceDatetime,
            institution_value = @institutionValue, cost_basis = @costBasis,
            iso_currency_code = @isoCurrency, unofficial_currency_code = @unofficialCurrency,
            vested_quantity = @vestedQuantity, vested_value = @vestedValue,
            updated_at = GETDATE()
        WHERE holding_id = @holdingId`, {
        holdingId,
        quantity: h.quantity,
        institutionPrice: h.institution_price,
        institutionPriceAsOf: h.institution_price_as_of,
        institutionPriceDatetime: h.institution_price_datetime,
        institutionValue: h.institution_value,
        costBasis: h.cost_basis,
        isoCurrency: h.iso_currency_code,
        unofficialCurrency: h.unofficial_currency_code,
        vestedQuantity: h.vested_quantity,
        vestedValue: h.vested_value,
    });
}
async function archiveRemovedHoldings(itemId, processedHoldingKeys, context) {
    // Get all current holdings for this item's accounts
    const currentHoldings = await (0, database_1.executeQuery)(`SELECT h.holding_id, h.account_id, h.security_id
         FROM holdings h
         JOIN accounts a ON h.account_id = a.account_id
         WHERE a.item_id = @itemId AND h.is_archived = 0`, { itemId });
    let archivedCount = 0;
    for (const holding of currentHoldings.recordset) {
        const holdingKey = `${holding.account_id}-${holding.security_id}`;
        if (!processedHoldingKeys.includes(holdingKey)) {
            // This holding is no longer in Plaid response - archive it
            await (0, database_1.executeQuery)(`UPDATE holdings 
                 SET is_archived = 1, archived_at = GETDATE(), archive_reason = 'not_in_plaid_response', updated_at = GETDATE()
                 WHERE holding_id = @holdingId`, { holdingId: holding.holding_id });
            archivedCount++;
        }
    }
    if (archivedCount > 0) {
        context.log(`Archived ${archivedCount} holdings no longer present in Plaid response`);
    }
    return archivedCount;
}
// ============================================================================
// Investment Transactions Sync
// ============================================================================
async function syncInvestmentTransactions(plaidClient, accessToken, itemId, accountMap, context) {
    const stats = { added: 0, updated: 0 };
    // Get last synced datetime to only fetch new transactions
    const itemResult = await (0, database_1.executeQuery)(`SELECT investment_transactions_last_synced_at FROM items WHERE item_id = @itemId`, { itemId });
    const lastSynced = itemResult.recordset[0]?.investment_transactions_last_synced_at;
    // Calculate date range
    // If first sync: fetch last 24 months (max allowed by Plaid)
    // If subsequent sync: fetch from last synced date to now
    const endDate = new Date();
    let startDate;
    if (lastSynced) {
        // Start from the last synced date
        startDate = new Date(lastSynced);
    }
    else {
        // First sync - go back 24 months
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 24);
    }
    const startDateStr = startDate.toISOString().split('T')[0];
    const endDateStr = endDate.toISOString().split('T')[0];
    context.log(`Fetching investment transactions from ${startDateStr} to ${endDateStr}`);
    // Build security mapping
    const securityMap = await getSecurityMapping();
    // Fetch all transactions with pagination
    let offset = 0;
    const count = 500; // Max per request
    let hasMore = true;
    let totalFetched = 0;
    while (hasMore) {
        const response = (await plaidClient.investmentsTransactionsGet({
            access_token: accessToken,
            start_date: startDateStr,
            end_date: endDateStr,
            options: {
                count,
                offset,
            },
        })).data;
        const transactions = response.investment_transactions || [];
        const securities = response.securities || [];
        totalFetched += transactions.length;
        // Process any new securities from this batch
        if (securities.length > 0) {
            await processSecurities(securities, context);
            // Refresh security map with any new securities
            const updatedSecurityMap = await getSecurityMapping();
            for (const [key, value] of updatedSecurityMap) {
                securityMap.set(key, value);
            }
        }
        // Process transactions
        for (const txn of transactions) {
            const txnStats = await processInvestmentTransaction(txn, accountMap, securityMap, context);
            if (txnStats === 'added')
                stats.added++;
            else if (txnStats === 'updated')
                stats.updated++;
        }
        // Check if there are more transactions
        hasMore = totalFetched < response.total_investment_transactions;
        offset += count;
        context.log(`Fetched ${totalFetched}/${response.total_investment_transactions} investment transactions`);
    }
    // Update last synced datetime
    await (0, database_1.executeQuery)(`UPDATE items SET investment_transactions_last_synced_at = GETDATE(), updated_at = GETDATE() WHERE item_id = @itemId`, { itemId });
    return stats;
}
async function processInvestmentTransaction(txn, accountMap, securityMap, context) {
    // Get our account_id
    const accountId = accountMap.get(txn.account_id);
    if (!accountId) {
        context.log.warn(`No account mapping for transaction account ${txn.account_id}`);
        return 'skipped';
    }
    // Get our security_id (may be null for cash transactions)
    let securityId = null;
    if (txn.security_id) {
        securityId = securityMap.get(txn.security_id) || null;
    }
    // Check if transaction already exists
    const existing = await (0, database_1.executeQuery)(`SELECT investment_transaction_id FROM investment_transactions 
         WHERE plaid_investment_transaction_id = @plaidTxnId`, { plaidTxnId: txn.investment_transaction_id });
    if (existing.recordset.length > 0) {
        // UPDATE existing transaction
        await updateInvestmentTransaction(existing.recordset[0].investment_transaction_id, txn, securityId);
        return 'updated';
    }
    else {
        // INSERT new transaction
        await insertInvestmentTransaction(accountId, securityId, txn);
        return 'added';
    }
}
async function insertInvestmentTransaction(accountId, securityId, txn) {
    await (0, database_1.executeQuery)(`INSERT INTO investment_transactions (
            account_id, security_id, plaid_investment_transaction_id,
            plaid_account_id, plaid_security_id,
            transaction_date, name, transaction_type, transaction_subtype,
            amount, price, quantity, fees, cancel_transaction_id,
            iso_currency_code, unofficial_currency_code
        )
        VALUES (
            @accountId, @securityId, @plaidTxnId,
            @plaidAccountId, @plaidSecurityId,
            @txnDate, @name, @txnType, @txnSubtype,
            @amount, @price, @quantity, @fees, @cancelTxnId,
            @isoCurrency, @unofficialCurrency
        )`, {
        accountId,
        securityId,
        plaidTxnId: txn.investment_transaction_id,
        plaidAccountId: txn.account_id,
        plaidSecurityId: txn.security_id || null,
        txnDate: txn.date,
        name: txn.name,
        txnType: txn.type,
        txnSubtype: txn.subtype,
        amount: txn.amount,
        price: txn.price,
        quantity: txn.quantity,
        fees: txn.fees,
        cancelTxnId: txn.cancel_transaction_id,
        isoCurrency: txn.iso_currency_code,
        unofficialCurrency: txn.unofficial_currency_code,
    });
}
async function updateInvestmentTransaction(investmentTransactionId, txn, securityId) {
    await (0, database_1.executeQuery)(`UPDATE investment_transactions SET
            security_id = @securityId,
            transaction_date = @txnDate, name = @name,
            transaction_type = @txnType, transaction_subtype = @txnSubtype,
            amount = @amount, price = @price, quantity = @quantity,
            fees = @fees, cancel_transaction_id = @cancelTxnId,
            iso_currency_code = @isoCurrency, unofficial_currency_code = @unofficialCurrency,
            updated_at = GETDATE()
        WHERE investment_transaction_id = @investmentTransactionId`, {
        investmentTransactionId,
        securityId,
        txnDate: txn.date,
        name: txn.name,
        txnType: txn.type,
        txnSubtype: txn.subtype,
        amount: txn.amount,
        price: txn.price,
        quantity: txn.quantity,
        fees: txn.fees,
        cancelTxnId: txn.cancel_transaction_id,
        isoCurrency: txn.iso_currency_code,
        unofficialCurrency: txn.unofficial_currency_code,
    });
}
// ============================================================================
// Mapping Helpers
// ============================================================================
async function getAccountMapping(itemId) {
    const accounts = await (0, database_1.executeQuery)(`SELECT account_id, plaid_account_id FROM accounts WHERE item_id = @itemId AND is_active = 1`, { itemId });
    const map = new Map();
    for (const acc of accounts.recordset) {
        map.set(acc.plaid_account_id, acc.account_id);
    }
    return map;
}
async function getSecurityMapping() {
    const securities = await (0, database_1.executeQuery)(`SELECT security_id, plaid_security_id FROM securities`);
    const map = new Map();
    for (const sec of securities.recordset) {
        map.set(sec.plaid_security_id, sec.security_id);
    }
    return map;
}
// ============================================================================
// Cascade Archive Functions
// ============================================================================
/**
 * Archive all investment holdings and transactions for an item
 */
async function archiveInvestmentsForItem(itemId, reason) {
    // Holdings
    await (0, database_1.executeQuery)(`UPDATE h SET h.is_archived = 1, h.archived_at = GETDATE(), h.archive_reason = @reason
         FROM holdings h
         JOIN accounts a ON h.account_id = a.account_id
         WHERE a.item_id = @itemId AND h.is_archived = 0`, { itemId, reason });
    // Transactions
    await (0, database_1.executeQuery)(`UPDATE t SET t.is_archived = 1, t.archived_at = GETDATE(), t.archive_reason = @reason
         FROM investment_transactions t
         JOIN accounts a ON t.account_id = a.account_id
         WHERE a.item_id = @itemId AND t.is_archived = 0`, { itemId, reason });
}
/**
 * Archive investment holdings and transactions for specific accounts
 */
async function archiveInvestmentsForAccounts(accountIds, reason) {
    if (accountIds.length === 0)
        return;
    const idList = accountIds.join(',');
    await (0, database_1.executeQuery)(`UPDATE holdings SET is_archived = 1, archived_at = GETDATE(), archive_reason = @reason
         WHERE account_id IN (${idList}) AND is_archived = 0`, { reason });
    await (0, database_1.executeQuery)(`UPDATE investment_transactions SET is_archived = 1, archived_at = GETDATE(), archive_reason = @reason
         WHERE account_id IN (${idList}) AND is_archived = 0`, { reason });
}
//# sourceMappingURL=investments-sync-service.js.map