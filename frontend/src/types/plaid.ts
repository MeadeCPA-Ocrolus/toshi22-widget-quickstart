/**
 * TypeScript types for Plaid integration frontend
 * @module types/plaid
 */

export type AccountType = 'sole_proprietor' | 'partnership' | 's_corp' | 'c_corp' | 'llc' | 'personal';

export interface Client {
    client_id: number;
    first_name: string;
    last_name: string;
    business_name: string | null;
    email: string;
    phone_number: string | null;
    account_type: AccountType;
    fiscal_year_start_date: string;
    state: string;
    federal_effective_tax_rate: number | null;
    state_effective_tax_rate: number | null;
    self_employment_tax_rate: number | null;
    blended_effective_tax_rate: number | null;
    target_tax_savings_percent: number | null;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
    item_count?: number;
    items_needing_attention?: number;
}

export interface ClientWithAlerts extends Client {
    items_needing_attention: number;
    has_login_required: boolean;
    has_needs_update: boolean;
    has_error: boolean;
    has_pending_sync: boolean;
}

export type ItemStatus = 'active' | 'login_required' | 'needs_update' | 'error';

export interface Item {
    item_id: number;
    client_id: number;
    plaid_item_id: string;
    institution_id: string | null;
    institution_name: string | null;
    status: ItemStatus;
    last_error_code: string | null;
    last_error_message: string | null;
    last_error_timestamp: string | null;
    error_attempt_count: number;
    consent_expiration_time: string | null;
    transactions_cursor: string | null;
    transactions_cursor_last_updated: string | null;
    transactions_last_successful_update: string | null;
    has_sync_updates: boolean;
    created_at: string;
    updated_at: string;
    is_archived: boolean;
}

export interface ItemWithAccounts extends Item {
    accounts: Account[];
}

export type PlaidAccountType = 'depository' | 'credit' | 'loan' | 'investment' | 'other';
export type PlaidAccountSubtype = 'checking' | 'savings' | 'cd' | 'money market' | 'credit card' | 'line of credit' | 'auto' | 'mortgage' | 'student' | '401k' | 'ira' | 'brokerage' | string;

export interface Account {
    account_id: number;
    item_id: number;
    plaid_account_id: string;
    account_name: string | null;
    official_name: string | null;
    account_type: PlaidAccountType;
    account_subtype: PlaidAccountSubtype | null;
    current_balance: number | null;
    available_balance: number | null;
    is_active: boolean;
    include_in_cash_on_hand: boolean;
    include_in_operating_metrics: boolean;
    last_updated_datetime: string | null;
    closed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface CreateLinkTokenRequest {
    clientId: number;
    itemId?: number;
    accountSelectionEnabled?: boolean;
}

export interface CreateLinkTokenResponse {
    hostedLinkUrl: string;
    linkToken: string;
    expiresAt: string;
    mode: 'new' | 'update';
}

export interface ApiError {
    error: string;
    message?: string;
    details?: unknown;
}

export interface ClientsResponse {
    clients: ClientWithAlerts[];
}

export interface ClientItemsResponse {
    client: Client;
    items: ItemWithAccounts[];
}

// Actual API response (items endpoint doesn't include client)
interface ItemsOnlyResponse {
    items: ItemWithAccounts[];
}