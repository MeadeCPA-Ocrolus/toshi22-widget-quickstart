/**
 * Client Data Export Endpoint
 *
 * GET /api/export-client-data?clientUuid=... — exports everything Azure
 * holds for one client as a downloadable ZIP: one folder per bank
 * connection, with a single-schema CSV per data type (accounts,
 * transactions, liabilities, holdings, securities, investment
 * transactions), plus a top-level client_info.csv.
 *
 * This is a staff-facing audit/export tool — not the TaxDome push itself.
 * Structuring it this way (clean, single-schema CSVs, clearly labeled
 * folders) also happens to be the right shape for a future automated
 * TaxDome hand-off or MCP consumption, without redesigning anything later.
 *
 * @module export-client-data
 */
import { AzureFunction } from '@azure/functions';
declare const httpTrigger: AzureFunction;
export default httpTrigger;
//# sourceMappingURL=index.d.ts.map