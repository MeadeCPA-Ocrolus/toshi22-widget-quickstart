/**
 * Liabilities Sync Service
 * 
 * Fetches liability data from Plaid and syncs to database.
 * Handles credit cards, student loans, and mortgages.
 * 
 * @module shared/liabilities-sync-service
 */

import { Context } from '@azure/functions';
import { PlaidApi, CreditCardLiability, StudentLoan, MortgageLiability } from 'plaid';
import { executeQuery } from './database';

// ============================================================================
// Types
// ============================================================================

interface SyncResult {
    success: boolean;
    item_id: number;
    credit: { added: number; updated: number; removed: number };
    student: { added: number; updated: number; removed: number };
    mortgage: { added: number; updated: number; removed: number };
    error?: string;
}

interface AccountMapping {
    account_id: number;
    plaid_account_id: string;
}

// ============================================================================
// Main Sync Function
// ============================================================================

/**
 * Sync liabilities for an item from Plaid
 */
export async function syncLiabilitiesForItem(
    plaidClient: PlaidApi,
    itemId: number,
    accessToken: string,
    context: Context
): Promise<SyncResult> {
    const result: SyncResult = {
        success: false,
        item_id: itemId,
        credit: { added: 0, updated: 0, removed: 0 },
        student: { added: 0, updated: 0, removed: 0 },
        mortgage: { added: 0, updated: 0, removed: 0 },
    };

    try {
        context.log(`Syncing liabilities for item ${itemId}`);

        // 1. Call Plaid /liabilities/get
        const response = await plaidClient.liabilitiesGet({
            access_token: accessToken,
        });

        const liabilities = response.data.liabilities;
        context.log(`Plaid returned: ${liabilities.credit?.length || 0} credit, ${liabilities.student?.length || 0} student, ${liabilities.mortgage?.length || 0} mortgage`);

        // 2. Get account mapping (plaid_account_id → our account_id)
        const accountMap = await getAccountMapping(itemId);

        // 3. Process each liability type
        if (liabilities.credit && liabilities.credit.length > 0) {
            result.credit = await processCreditCards(liabilities.credit, accountMap, itemId, context);
        }

        if (liabilities.student && liabilities.student.length > 0) {
            result.student = await processStudentLoans(liabilities.student, accountMap, itemId, context);
        }

        if (liabilities.mortgage && liabilities.mortgage.length > 0) {
            result.mortgage = await processMortgages(liabilities.mortgage, accountMap, itemId, context);
        }

        // 4. Update item's last sync time
        await executeQuery(
            `UPDATE items SET liabilities_last_successful_update = GETDATE(), liabilities_error_code = NULL, updated_at = GETDATE() WHERE item_id = @itemId`,
            { itemId }
        );

        result.success = true;
        context.log(`Liabilities sync complete for item ${itemId}`);

    } catch (err: any) {
        context.log.error(`Liabilities sync failed for item ${itemId}:`, err);
        
        // Extract Plaid error details
        const plaidErrorCode = err.response?.data?.error_code;
        
        if (plaidErrorCode === 'PRODUCTS_NOT_SUPPORTED') {
            result.error = 'PRODUCTS_NOT_SUPPORTED';
            // Store error on item so frontend knows liabilities aren't available
            await executeQuery(
                `UPDATE items SET liabilities_error_code = @errorCode, updated_at = GETDATE() WHERE item_id = @itemId`,
                { itemId, errorCode: 'PRODUCTS_NOT_SUPPORTED' }
            );
            context.log(`Liabilities sync: Institution does not support liabilities product`);
        } else {
            result.error = plaidErrorCode || err.message || 'Unknown error';
            // Store other errors too
            if (plaidErrorCode) {
                await executeQuery(
                    `UPDATE items SET liabilities_error_code = @errorCode, updated_at = GETDATE() WHERE item_id = @itemId`,
                    { itemId, errorCode: plaidErrorCode }
                );
            }
        }
    }

    return result;
}

// ============================================================================
// Account Mapping
// ============================================================================

async function getAccountMapping(itemId: number): Promise<Map<string, number>> {
    const accounts = await executeQuery<AccountMapping>(
        `SELECT account_id, plaid_account_id FROM accounts WHERE item_id = @itemId AND is_active = 1`,
        { itemId }
    );

    const map = new Map<string, number>();
    for (const acc of accounts.recordset) {
        map.set(acc.plaid_account_id, acc.account_id);
    }
    return map;
}

// ============================================================================
// Credit Card Processing
// ============================================================================

async function processCreditCards(
    creditCards: CreditCardLiability[],
    accountMap: Map<string, number>,
    itemId: number,
    context: Context
): Promise<{ added: number; updated: number; removed: number }> {
    const stats = { added: 0, updated: 0, removed: 0 };
    const processedAccountIds: number[] = [];

    for (const cc of creditCards) {
        if (!cc.account_id) {
            context.log.warn(`Credit card missing account_id, skipping`);
            continue;
        }
        const accountId = accountMap.get(cc.account_id);
        if (!accountId) {
            context.log.warn(`No account mapping for credit card account ${cc.account_id}`);
            continue;
        }

        processedAccountIds.push(accountId);

        // Check if exists
        const existing = await executeQuery<{ credit_liability_id: number }>(
            `SELECT credit_liability_id FROM liabilities_credit WHERE account_id = @accountId AND is_archived = 0`,
            { accountId }
        );

        if (existing.recordset.length > 0) {
            // UPDATE
            await updateCreditCard(existing.recordset[0].credit_liability_id, cc);
            stats.updated++;
        } else {
            // INSERT
            await insertCreditCard(accountId, cc);
            stats.added++;
        }
    }

    // Soft delete any credit liabilities for this item that weren't in the response
    if (processedAccountIds.length > 0) {
        const removed = await executeQuery(
            `UPDATE lc
             SET lc.is_archived = 1, lc.archived_at = GETDATE(), lc.archive_reason = 'not_in_plaid_response'
             FROM liabilities_credit lc
             JOIN accounts a ON lc.account_id = a.account_id
             WHERE a.item_id = @itemId 
               AND lc.is_archived = 0 
               AND lc.account_id NOT IN (${processedAccountIds.join(',')})`,
            { itemId }
        );
        stats.removed = removed.rowsAffected?.[0] || 0;
    }

    return stats;
}

async function insertCreditCard(accountId: number, cc: CreditCardLiability): Promise<number> {
    const result = await executeQuery<{ credit_liability_id: number }>(
        `INSERT INTO liabilities_credit (
            account_id, is_overdue, last_payment_amount, last_payment_date,
            last_statement_balance, last_statement_issue_date,
            minimum_payment_amount, next_payment_due_date
        )
        OUTPUT INSERTED.credit_liability_id
        VALUES (
            @accountId, @isOverdue, @lastPaymentAmount, @lastPaymentDate,
            @lastStatementBalance, @lastStatementIssueDate,
            @minimumPaymentAmount, @nextPaymentDueDate
        )`,
        {
            accountId,
            isOverdue: cc.is_overdue || false,
            lastPaymentAmount: cc.last_payment_amount,
            lastPaymentDate: cc.last_payment_date,
            lastStatementBalance: cc.last_statement_balance,
            lastStatementIssueDate: cc.last_statement_issue_date,
            minimumPaymentAmount: cc.minimum_payment_amount,
            nextPaymentDueDate: cc.next_payment_due_date,
        }
    );

    const creditLiabilityId = result.recordset[0].credit_liability_id;

    // Insert APRs
    if (cc.aprs && cc.aprs.length > 0) {
        for (const apr of cc.aprs) {
            await executeQuery(
                `INSERT INTO liabilities_credit_aprs (
                    credit_liability_id, apr_percentage, apr_type,
                    balance_subject_to_apr, interest_charge_amount
                )
                VALUES (@creditLiabilityId, @aprPercentage, @aprType, @balanceSubject, @interestCharge)`,
                {
                    creditLiabilityId,
                    aprPercentage: apr.apr_percentage,
                    aprType: apr.apr_type,
                    balanceSubject: apr.balance_subject_to_apr,
                    interestCharge: apr.interest_charge_amount,
                }
            );
        }
    }

    return creditLiabilityId;
}

async function updateCreditCard(creditLiabilityId: number, cc: CreditCardLiability): Promise<void> {
    await executeQuery(
        `UPDATE liabilities_credit SET
            is_overdue = @isOverdue,
            last_payment_amount = @lastPaymentAmount,
            last_payment_date = @lastPaymentDate,
            last_statement_balance = @lastStatementBalance,
            last_statement_issue_date = @lastStatementIssueDate,
            minimum_payment_amount = @minimumPaymentAmount,
            next_payment_due_date = @nextPaymentDueDate,
            updated_at = GETDATE()
        WHERE credit_liability_id = @creditLiabilityId`,
        {
            creditLiabilityId,
            isOverdue: cc.is_overdue || false,
            lastPaymentAmount: cc.last_payment_amount,
            lastPaymentDate: cc.last_payment_date,
            lastStatementBalance: cc.last_statement_balance,
            lastStatementIssueDate: cc.last_statement_issue_date,
            minimumPaymentAmount: cc.minimum_payment_amount,
            nextPaymentDueDate: cc.next_payment_due_date,
        }
    );

    // Replace APRs (delete and re-insert)
    await executeQuery(
        `DELETE FROM liabilities_credit_aprs WHERE credit_liability_id = @creditLiabilityId`,
        { creditLiabilityId }
    );

    if (cc.aprs && cc.aprs.length > 0) {
        for (const apr of cc.aprs) {
            await executeQuery(
                `INSERT INTO liabilities_credit_aprs (
                    credit_liability_id, apr_percentage, apr_type,
                    balance_subject_to_apr, interest_charge_amount
                )
                VALUES (@creditLiabilityId, @aprPercentage, @aprType, @balanceSubject, @interestCharge)`,
                {
                    creditLiabilityId,
                    aprPercentage: apr.apr_percentage,
                    aprType: apr.apr_type,
                    balanceSubject: apr.balance_subject_to_apr,
                    interestCharge: apr.interest_charge_amount,
                }
            );
        }
    }
}

// ============================================================================
// Student Loan Processing
// ============================================================================

async function processStudentLoans(
    studentLoans: StudentLoan[],
    accountMap: Map<string, number>,
    itemId: number,
    context: Context
): Promise<{ added: number; updated: number; removed: number }> {
    const stats = { added: 0, updated: 0, removed: 0 };
    const processedAccountIds: number[] = [];

    for (const loan of studentLoans) {
        if (!loan.account_id) {
            context.log.warn(`Student loan missing account_id, skipping`);
            continue;
        }
        const accountId = accountMap.get(loan.account_id);
        if (!accountId) {
            context.log.warn(`No account mapping for student loan account ${loan.account_id}`);
            continue;
        }

        processedAccountIds.push(accountId);

        // Check if exists
        const existing = await executeQuery<{ student_liability_id: number }>(
            `SELECT student_liability_id FROM liabilities_student WHERE account_id = @accountId AND is_archived = 0`,
            { accountId }
        );

        if (existing.recordset.length > 0) {
            await updateStudentLoan(existing.recordset[0].student_liability_id, loan);
            stats.updated++;
        } else {
            await insertStudentLoan(accountId, loan);
            stats.added++;
        }
    }

    // Soft delete removed
    if (processedAccountIds.length > 0) {
        const removed = await executeQuery(
            `UPDATE ls
             SET ls.is_archived = 1, ls.archived_at = GETDATE(), ls.archive_reason = 'not_in_plaid_response'
             FROM liabilities_student ls
             JOIN accounts a ON ls.account_id = a.account_id
             WHERE a.item_id = @itemId 
               AND ls.is_archived = 0 
               AND ls.account_id NOT IN (${processedAccountIds.join(',')})`,
            { itemId }
        );
        stats.removed = removed.rowsAffected?.[0] || 0;
    }

    return stats;
}

async function insertStudentLoan(accountId: number, loan: StudentLoan): Promise<void> {
    await executeQuery(
        `INSERT INTO liabilities_student (
            account_id, account_number, loan_name,
            origination_date, origination_principal_amount, expected_payoff_date,
            guarantor, interest_rate_percentage,
            loan_status_type, loan_status_end_date,
            repayment_plan_type, repayment_plan_description,
            outstanding_interest_amount,
            is_overdue, last_payment_amount, last_payment_date,
            minimum_payment_amount, next_payment_due_date,
            ytd_interest_paid, ytd_principal_paid,
            servicer_address_city, servicer_address_country,
            servicer_address_postal_code, servicer_address_region, servicer_address_street,
            disbursement_dates
        )
        VALUES (
            @accountId, @accountNumber, @loanName,
            @originationDate, @originationPrincipal, @expectedPayoff,
            @guarantor, @interestRate,
            @loanStatusType, @loanStatusEndDate,
            @repaymentPlanType, @repaymentPlanDesc,
            @outstandingInterest,
            @isOverdue, @lastPaymentAmount, @lastPaymentDate,
            @minimumPayment, @nextPaymentDueDate,
            @ytdInterest, @ytdPrincipal,
            @servicerCity, @servicerCountry,
            @servicerPostal, @servicerRegion, @servicerStreet,
            @disbursementDates
        )`,
        {
            accountId,
            accountNumber: loan.account_number,
            loanName: loan.loan_name,
            originationDate: loan.origination_date,
            originationPrincipal: loan.origination_principal_amount,
            expectedPayoff: loan.expected_payoff_date,
            guarantor: loan.guarantor,
            interestRate: loan.interest_rate_percentage,
            loanStatusType: loan.loan_status?.type,
            loanStatusEndDate: loan.loan_status?.end_date,
            repaymentPlanType: loan.repayment_plan?.type,
            repaymentPlanDesc: loan.repayment_plan?.description,
            outstandingInterest: loan.outstanding_interest_amount,
            isOverdue: loan.is_overdue || false,
            lastPaymentAmount: loan.last_payment_amount,
            lastPaymentDate: loan.last_payment_date,
            minimumPayment: loan.minimum_payment_amount,
            nextPaymentDueDate: loan.next_payment_due_date,
            ytdInterest: loan.ytd_interest_paid,
            ytdPrincipal: loan.ytd_principal_paid,
            servicerCity: loan.servicer_address?.city,
            servicerCountry: loan.servicer_address?.country,
            servicerPostal: loan.servicer_address?.postal_code,
            servicerRegion: loan.servicer_address?.region,
            servicerStreet: loan.servicer_address?.street,
            disbursementDates: loan.disbursement_dates ? JSON.stringify(loan.disbursement_dates) : null,
        }
    );
}

async function updateStudentLoan(studentLiabilityId: number, loan: StudentLoan): Promise<void> {
    await executeQuery(
        `UPDATE liabilities_student SET
            account_number = @accountNumber, loan_name = @loanName,
            origination_date = @originationDate, origination_principal_amount = @originationPrincipal,
            expected_payoff_date = @expectedPayoff, guarantor = @guarantor,
            interest_rate_percentage = @interestRate,
            loan_status_type = @loanStatusType, loan_status_end_date = @loanStatusEndDate,
            repayment_plan_type = @repaymentPlanType, repayment_plan_description = @repaymentPlanDesc,
            outstanding_interest_amount = @outstandingInterest,
            is_overdue = @isOverdue, last_payment_amount = @lastPaymentAmount,
            last_payment_date = @lastPaymentDate, minimum_payment_amount = @minimumPayment,
            next_payment_due_date = @nextPaymentDueDate,
            ytd_interest_paid = @ytdInterest, ytd_principal_paid = @ytdPrincipal,
            servicer_address_city = @servicerCity, servicer_address_country = @servicerCountry,
            servicer_address_postal_code = @servicerPostal, servicer_address_region = @servicerRegion,
            servicer_address_street = @servicerStreet,
            disbursement_dates = @disbursementDates,
            updated_at = GETDATE()
        WHERE student_liability_id = @studentLiabilityId`,
        {
            studentLiabilityId,
            accountNumber: loan.account_number,
            loanName: loan.loan_name,
            originationDate: loan.origination_date,
            originationPrincipal: loan.origination_principal_amount,
            expectedPayoff: loan.expected_payoff_date,
            guarantor: loan.guarantor,
            interestRate: loan.interest_rate_percentage,
            loanStatusType: loan.loan_status?.type,
            loanStatusEndDate: loan.loan_status?.end_date,
            repaymentPlanType: loan.repayment_plan?.type,
            repaymentPlanDesc: loan.repayment_plan?.description,
            outstandingInterest: loan.outstanding_interest_amount,
            isOverdue: loan.is_overdue || false,
            lastPaymentAmount: loan.last_payment_amount,
            lastPaymentDate: loan.last_payment_date,
            minimumPayment: loan.minimum_payment_amount,
            nextPaymentDueDate: loan.next_payment_due_date,
            ytdInterest: loan.ytd_interest_paid,
            ytdPrincipal: loan.ytd_principal_paid,
            servicerCity: loan.servicer_address?.city,
            servicerCountry: loan.servicer_address?.country,
            servicerPostal: loan.servicer_address?.postal_code,
            servicerRegion: loan.servicer_address?.region,
            servicerStreet: loan.servicer_address?.street,
            disbursementDates: loan.disbursement_dates ? JSON.stringify(loan.disbursement_dates) : null,
        }
    );
}

// ============================================================================
// Mortgage Processing
// ============================================================================

async function processMortgages(
    mortgages: MortgageLiability[],
    accountMap: Map<string, number>,
    itemId: number,
    context: Context
): Promise<{ added: number; updated: number; removed: number }> {
    const stats = { added: 0, updated: 0, removed: 0 };
    const processedAccountIds: number[] = [];

    for (const mortgage of mortgages) {
        if (!mortgage.account_id) {
            context.log.warn(`Mortgage missing account_id, skipping`);
            continue;
        }
        const accountId = accountMap.get(mortgage.account_id);
        if (!accountId) {
            context.log.warn(`No account mapping for mortgage account ${mortgage.account_id}`);
            continue;
        }

        processedAccountIds.push(accountId);

        const existing = await executeQuery<{ mortgage_liability_id: number }>(
            `SELECT mortgage_liability_id FROM liabilities_mortgage WHERE account_id = @accountId AND is_archived = 0`,
            { accountId }
        );

        if (existing.recordset.length > 0) {
            await updateMortgage(existing.recordset[0].mortgage_liability_id, mortgage);
            stats.updated++;
        } else {
            await insertMortgage(accountId, mortgage);
            stats.added++;
        }
    }

    // Soft delete removed
    if (processedAccountIds.length > 0) {
        const removed = await executeQuery(
            `UPDATE lm
             SET lm.is_archived = 1, lm.archived_at = GETDATE(), lm.archive_reason = 'not_in_plaid_response'
             FROM liabilities_mortgage lm
             JOIN accounts a ON lm.account_id = a.account_id
             WHERE a.item_id = @itemId 
               AND lm.is_archived = 0 
               AND lm.account_id NOT IN (${processedAccountIds.join(',')})`,
            { itemId }
        );
        stats.removed = removed.rowsAffected?.[0] || 0;
    }

    return stats;
}

async function insertMortgage(accountId: number, m: MortgageLiability): Promise<void> {
    await executeQuery(
        `INSERT INTO liabilities_mortgage (
            account_id, account_number, loan_type_description, loan_term,
            origination_date, origination_principal_amount, maturity_date,
            interest_rate_percentage, interest_rate_type,
            property_address_city, property_address_country,
            property_address_postal_code, property_address_region, property_address_street,
            has_pmi, has_prepayment_penalty, escrow_balance,
            current_late_fee, past_due_amount,
            last_payment_amount, last_payment_date,
            next_monthly_payment, next_payment_due_date,
            ytd_interest_paid, ytd_principal_paid
        )
        VALUES (
            @accountId, @accountNumber, @loanType, @loanTerm,
            @originationDate, @originationPrincipal, @maturityDate,
            @interestRate, @interestRateType,
            @propCity, @propCountry, @propPostal, @propRegion, @propStreet,
            @hasPmi, @hasPrepayPenalty, @escrowBalance,
            @currentLateFee, @pastDueAmount,
            @lastPaymentAmount, @lastPaymentDate,
            @nextMonthlyPayment, @nextPaymentDueDate,
            @ytdInterest, @ytdPrincipal
        )`,
        {
            accountId,
            accountNumber: m.account_number,
            loanType: m.loan_type_description,
            loanTerm: m.loan_term,
            originationDate: m.origination_date,
            originationPrincipal: m.origination_principal_amount,
            maturityDate: m.maturity_date,
            interestRate: m.interest_rate?.percentage,
            interestRateType: m.interest_rate?.type,
            propCity: m.property_address?.city,
            propCountry: m.property_address?.country,
            propPostal: m.property_address?.postal_code,
            propRegion: m.property_address?.region,
            propStreet: m.property_address?.street,
            hasPmi: m.has_pmi,
            hasPrepayPenalty: m.has_prepayment_penalty,
            escrowBalance: m.escrow_balance,
            currentLateFee: m.current_late_fee,
            pastDueAmount: m.past_due_amount,
            lastPaymentAmount: m.last_payment_amount,
            lastPaymentDate: m.last_payment_date,
            nextMonthlyPayment: m.next_monthly_payment,
            nextPaymentDueDate: m.next_payment_due_date,
            ytdInterest: m.ytd_interest_paid,
            ytdPrincipal: m.ytd_principal_paid,
        }
    );
}

async function updateMortgage(mortgageLiabilityId: number, m: MortgageLiability): Promise<void> {
    await executeQuery(
        `UPDATE liabilities_mortgage SET
            account_number = @accountNumber, loan_type_description = @loanType, loan_term = @loanTerm,
            origination_date = @originationDate, origination_principal_amount = @originationPrincipal,
            maturity_date = @maturityDate,
            interest_rate_percentage = @interestRate, interest_rate_type = @interestRateType,
            property_address_city = @propCity, property_address_country = @propCountry,
            property_address_postal_code = @propPostal, property_address_region = @propRegion,
            property_address_street = @propStreet,
            has_pmi = @hasPmi, has_prepayment_penalty = @hasPrepayPenalty, escrow_balance = @escrowBalance,
            current_late_fee = @currentLateFee,
            past_due_amount = @pastDueAmount,
            last_payment_amount = @lastPaymentAmount, last_payment_date = @lastPaymentDate,
            next_monthly_payment = @nextMonthlyPayment, next_payment_due_date = @nextPaymentDueDate,
            ytd_interest_paid = @ytdInterest, ytd_principal_paid = @ytdPrincipal,
            updated_at = GETDATE()
        WHERE mortgage_liability_id = @mortgageLiabilityId`,
        {
            mortgageLiabilityId,
            accountNumber: m.account_number,
            loanType: m.loan_type_description,
            loanTerm: m.loan_term,
            originationDate: m.origination_date,
            originationPrincipal: m.origination_principal_amount,
            maturityDate: m.maturity_date,
            interestRate: m.interest_rate?.percentage,
            interestRateType: m.interest_rate?.type,
            propCity: m.property_address?.city,
            propCountry: m.property_address?.country,
            propPostal: m.property_address?.postal_code,
            propRegion: m.property_address?.region,
            propStreet: m.property_address?.street,
            hasPmi: m.has_pmi,
            hasPrepayPenalty: m.has_prepayment_penalty,
            escrowBalance: m.escrow_balance,
            currentLateFee: m.current_late_fee,
            pastDueAmount: m.past_due_amount,
            lastPaymentAmount: m.last_payment_amount,
            lastPaymentDate: m.last_payment_date,
            nextMonthlyPayment: m.next_monthly_payment,
            nextPaymentDueDate: m.next_payment_due_date,
            ytdInterest: m.ytd_interest_paid,
            ytdPrincipal: m.ytd_principal_paid,
        }
    );
}

// ============================================================================
// Cascade Archive Functions (called when item/account is archived)
// ============================================================================

/**
 * Archive all liabilities for an item
 */
export async function archiveLiabilitiesForItem(itemId: number, reason: string): Promise<void> {
    // Credit
    await executeQuery(
        `UPDATE lc SET lc.is_archived = 1, lc.archived_at = GETDATE(), lc.archive_reason = @reason
         FROM liabilities_credit lc
         JOIN accounts a ON lc.account_id = a.account_id
         WHERE a.item_id = @itemId AND lc.is_archived = 0`,
        { itemId, reason }
    );

    // Student
    await executeQuery(
        `UPDATE ls SET ls.is_archived = 1, ls.archived_at = GETDATE(), ls.archive_reason = @reason
         FROM liabilities_student ls
         JOIN accounts a ON ls.account_id = a.account_id
         WHERE a.item_id = @itemId AND ls.is_archived = 0`,
        { itemId, reason }
    );

    // Mortgage
    await executeQuery(
        `UPDATE lm SET lm.is_archived = 1, lm.archived_at = GETDATE(), lm.archive_reason = @reason
         FROM liabilities_mortgage lm
         JOIN accounts a ON lm.account_id = a.account_id
         WHERE a.item_id = @itemId AND lm.is_archived = 0`,
        { itemId, reason }
    );
}

/**
 * Archive all liabilities for specific accounts
 */
export async function archiveLiabilitiesForAccounts(accountIds: number[], reason: string): Promise<void> {
    if (accountIds.length === 0) return;
    
    const idList = accountIds.join(',');

    await executeQuery(
        `UPDATE liabilities_credit SET is_archived = 1, archived_at = GETDATE(), archive_reason = @reason
         WHERE account_id IN (${idList}) AND is_archived = 0`,
        { reason }
    );

    await executeQuery(
        `UPDATE liabilities_student SET is_archived = 1, archived_at = GETDATE(), archive_reason = @reason
         WHERE account_id IN (${idList}) AND is_archived = 0`,
        { reason }
    );

    await executeQuery(
        `UPDATE liabilities_mortgage SET is_archived = 1, archived_at = GETDATE(), archive_reason = @reason
         WHERE account_id IN (${idList}) AND is_archived = 0`,
        { reason }
    );
}