/**
 * Clients Endpoint
 *
 * GET /api/clients - List all clients (with optional search)
 * GET /api/clients/:id - Get single client
 * POST /api/clients - Create new client
 * PUT /api/clients/:id - Update client
 * DELETE /api/clients/:id - Delete client (with cascade)
 *
 * Query Parameters for GET /api/clients:
 * - search: Search by name, email, or business name (case-insensitive)
 * - status: Filter by sync_status ('active', 'needs_sync', 'error')
 * - hasIssues: Filter to clients with items needing attention ('true'/'false')
 *
 * @module clients
 */
import { AzureFunction } from '@azure/functions';
/**
 * Main HTTP trigger handler
 */
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map