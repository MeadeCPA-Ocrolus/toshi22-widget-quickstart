/**
 * Liabilities API Service
 * 
 * Frontend service for fetching liability data
 * 
 * @module services/liabilities-api
 */

import { LiabilitiesResponse, CreditLiability, StudentLiability, MortgageLiability } from '../types/liabilities';
import { fetchApi } from './api';

/**
 * Get liabilities for a specific account
 */
export async function getLiabilitiesForAccount(accountId: number): Promise<LiabilitiesResponse> {
    return fetchApi<LiabilitiesResponse>(`/liabilities?accountId=${accountId}`);
}

/**
 * Get all liabilities for an item (bank connection)
 */
export async function getLiabilitiesForItem(itemId: number): Promise<LiabilitiesResponse> {
    return fetchApi<LiabilitiesResponse>(`/liabilities?itemId=${itemId}`);
}

/**
 * Get all liabilities for a client
 */
export async function getLiabilitiesForClient(clientId: number): Promise<LiabilitiesResponse> {
    return fetchApi<LiabilitiesResponse>(`/liabilities?clientId=${clientId}`);
}

/**
 * Get credit card liability for a specific account (convenience method)
 */
export async function getCreditLiabilityForAccount(accountId: number): Promise<CreditLiability | null> {
    const response = await getLiabilitiesForAccount(accountId);
    return response.credit.find(c => c.account_id === accountId) || null;
}

/**
 * Get student loan liability for a specific account (convenience method)
 */
export async function getStudentLiabilityForAccount(accountId: number): Promise<StudentLiability | null> {
    const response = await getLiabilitiesForAccount(accountId);
    return response.student.find(s => s.account_id === accountId) || null;
}

/**
 * Get mortgage liability for a specific account (convenience method)
 */
export async function getMortgageLiabilityForAccount(accountId: number): Promise<MortgageLiability | null> {
    const response = await getLiabilitiesForAccount(accountId);
    return response.mortgage.find(m => m.account_id === accountId) || null;
}

/**
 * Check if account MIGHT have liability data
 * We're permissive here - if account is credit or loan type, try to load liabilities
 * The actual data will determine if we show the card
 */
export function hasLiabilityData(accountType: string, accountSubtype: string | null): boolean {
    // Any credit account might have credit card liability data
    if (accountType === 'credit') {
        return true;
    }
    // Any loan account might have student loan or mortgage liability data
    if (accountType === 'loan') {
        return true;
    }
    return false;
}

/**
 * Get liability type for an account
 */
export function getLiabilityType(accountType: string, accountSubtype: string | null): 'credit' | 'student' | 'mortgage' | null {
    if (accountType === 'credit' && (accountSubtype === 'credit card' || accountSubtype === 'paypal')) {
        return 'credit';
    }
    if (accountType === 'loan' && accountSubtype === 'student') {
        return 'student';
    }
    if (accountType === 'loan' && accountSubtype === 'mortgage') {
        return 'mortgage';
    }
    return null;
}