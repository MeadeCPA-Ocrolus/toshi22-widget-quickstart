/**
 * Investments API Service
 * 
 * Functions for fetching investment data from the backend
 * 
 * @module services/investments-api
 */

import { InvestmentsResponse, InvestmentHolding, InvestmentTransaction } from '../types/investments';

const API_BASE = '/api';

/**
 * Get investments for a specific account
 */
export async function getInvestmentsForAccount(accountId: number): Promise<InvestmentsResponse> {
    const response = await fetch(`${API_BASE}/investments?accountId=${accountId}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch investments: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Get investments for all accounts in an item
 */
export async function getInvestmentsForItem(itemId: number): Promise<InvestmentsResponse> {
    const response = await fetch(`${API_BASE}/investments?itemId=${itemId}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch investments: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Get investments for all accounts for a client
 */
export async function getInvestmentsForClient(clientId: number): Promise<InvestmentsResponse> {
    const response = await fetch(`${API_BASE}/investments?clientId=${clientId}`);
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `Failed to fetch investments: ${response.status}`);
    }
    
    return response.json();
}

/**
 * Check if an account has investment data
 */
export function isInvestmentAccount(accountType: string): boolean {
    return accountType === 'investment' || accountType === 'brokerage';
}

/**
 * Get holdings for a specific account from a full response
 */
export function getHoldingsForAccount(
    response: InvestmentsResponse, 
    accountId: number
): InvestmentHolding[] {
    return response.holdings.filter(h => h.account_id === accountId);
}

/**
 * Get transactions for a specific account from a full response
 */
export function getTransactionsForAccount(
    response: InvestmentsResponse,
    accountId: number
): InvestmentTransaction[] {
    return response.transactions.filter(t => t.account_id === accountId);
}

/**
 * Calculate total value for holdings
 */
export function calculateTotalValue(holdings: InvestmentHolding[]): number {
    return holdings.reduce((sum, h) => sum + h.institution_value, 0);
}

/**
 * Calculate total cost basis for holdings
 */
export function calculateTotalCostBasis(holdings: InvestmentHolding[]): number {
    return holdings.reduce((sum, h) => sum + (h.cost_basis || 0), 0);
}

/**
 * Calculate total gain/loss for holdings
 */
export function calculateTotalGainLoss(holdings: InvestmentHolding[]): { amount: number; percentage: number } | null {
    const totalValue = calculateTotalValue(holdings);
    const totalCostBasis = calculateTotalCostBasis(holdings);
    
    if (totalCostBasis === 0) return null;
    
    const amount = totalValue - totalCostBasis;
    const percentage = (amount / totalCostBasis) * 100;
    
    return { amount, percentage };
}