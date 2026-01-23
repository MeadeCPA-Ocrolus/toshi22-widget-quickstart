/**
 * API Service for Plaid Integration
 * @module services/api
 */

import {
    Client,
    ClientsResponse,
    ClientItemsResponse,
    CreateLinkTokenRequest,
    CreateLinkTokenResponse,
    ItemWithAccounts,
    ApiError,
} from '../types/plaid';

const API_BASE_URL = '/api';

async function fetchApi<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`;
    const defaultHeaders: HeadersInit = { 'Content-Type': 'application/json' };

    const response = await fetch(url, {
        ...options,
        headers: { ...defaultHeaders, ...options.headers },
    });

    let data: T | ApiError;
    try {
        data = await response.json();
    } catch {
        if (!response.ok) {
            throw { error: `HTTP ${response.status}`, message: response.statusText } as ApiError;
        }
        return {} as T;
    }

    if (!response.ok) {
        throw data as ApiError;
    }

    return data as T;
}

export interface ClientsQueryParams {
    search?: string;
    status?: string;
    hasIssues?: boolean;
}

export async function getClients(params?: ClientsQueryParams): Promise<ClientsResponse> {
    const queryParts: string[] = [];
    if (params?.search) queryParts.push(`search=${encodeURIComponent(params.search)}`);
    if (params?.status) queryParts.push(`status=${encodeURIComponent(params.status)}`);
    if (params?.hasIssues !== undefined) queryParts.push(`hasIssues=${params.hasIssues}`);
    const queryString = queryParts.length > 0 ? `?${queryParts.join('&')}` : '';
    return fetchApi<ClientsResponse>(`/clients${queryString}`);
}

export async function getClient(clientId: number): Promise<{ client: Client }> {
    return fetchApi<{ client: Client }>(`/clients/${clientId}`);
}

export async function createClient(client: Omit<Client, 'client_id' | 'created_at' | 'updated_at'>): Promise<{ client: Client; message: string }> {
    return fetchApi<{ client: Client; message: string }>('/clients', { method: 'POST', body: JSON.stringify(client) });
}

export async function updateClient(clientId: number, updates: Partial<Client>): Promise<{ client: Client; message: string }> {
    return fetchApi<{ client: Client; message: string }>(`/clients/${clientId}`, { method: 'PUT', body: JSON.stringify(updates) });
}

export async function deleteClient(clientId: number): Promise<{ message: string }> {
    return fetchApi<{ message: string }>(`/clients/${clientId}`, { method: 'DELETE' });
}

export async function getClientItems(clientId: number): Promise<ClientItemsResponse> {
    return fetchApi<ClientItemsResponse>(`/clients/${clientId}/items`);
}

export async function getItem(itemId: number): Promise<{ item: ItemWithAccounts }> {
    return fetchApi<{ item: ItemWithAccounts }>(`/items/${itemId}`);
}

export async function deleteItem(itemId: number, removeFromPlaid: boolean = false): Promise<{ message: string }> {
    const query = removeFromPlaid ? '?removeFromPlaid=true' : '';
    return fetchApi<{ message: string }>(`/items/${itemId}${query}`, { method: 'DELETE' });
}

export async function createLinkToken(request: CreateLinkTokenRequest): Promise<CreateLinkTokenResponse> {
    return fetchApi<CreateLinkTokenResponse>('/plaid/link-token', { method: 'POST', body: JSON.stringify(request) });
}

export async function syncTransactions(itemId: number): Promise<{ message: string; added: number; modified: number; removed: number }> {
    return fetchApi<{ message: string; added: number; modified: number; removed: number }>(`/items/${itemId}/sync`, { method: 'POST' });
}

export function getClientDisplayName(client: Client): string {
    return client.business_name || `${client.first_name} ${client.last_name}`;
}

export function formatCurrency(amount: number | null): string {
    if (amount === null) return '—';
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function formatDate(dateString: string | null): string {
    if (!dateString) return '—';
    return new Date(dateString).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatRelativeTime(dateString: string | null): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    return formatDate(dateString);
}
