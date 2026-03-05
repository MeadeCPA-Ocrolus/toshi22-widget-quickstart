# Meade CPA Financial Data Platform

A full-stack financial data management system built for CPAs to automate bank data retrieval and client financial tracking.

## Overview

This platform integrates with [Plaid](https://plaid.com/) to automatically sync banking, investment, and liability data from client bank accounts. CPAs can manage clients, view real-time financial data, and categorize transactions—eliminating the manual collection of bank statements.

## Tech Stack

- **Frontend**: React 18, TypeScript, Material-UI
- **Backend**: Azure Functions (Node.js 18, TypeScript)
- **Database**: Azure SQL Database (Serverless)
- **Authentication**: Azure AD / Entra ID
- **Infrastructure**: Azure Static Web Apps, Azure Key Vault, GitHub Actions CI/CD

## Features

### Bank Account Connections
- CPAs send Plaid Hosted Links to clients via the dashboard
- Clients securely connect their bank accounts without CPA involvement
- Supports 10,000+ financial institutions

### Automated Data Sync
- **Transactions**: Daily transaction sync with cursor-based pagination
- **Investments**: Holdings, securities, and investment transaction history
- **Liabilities**: Credit cards, student loans, and mortgages with APR details

### Real-Time Updates
- Webhook-driven architecture processes 10+ Plaid event types
- Automatic sync on new transactions, holdings updates, and account changes
- Re-authentication flow when bank credentials expire

### CPA Dashboard
- Client management with connected bank accounts
- Transaction categorization for low-confidence items
- Liability details with tax-relevant fields (YTD interest)
- Investment portfolio view with gain/loss analytics

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React Frontend │────▶│  Azure Functions │────▶│   Azure SQL     │
│  (Static Web App)│     │  (13 endpoints)  │     │   Database      │
└─────────────────┘     └────────┬─────────┘     └─────────────────┘
                                 │
                                 ▼
                        ┌──────────────────┐
                        │    Plaid API     │
                        │ (Transactions,   │
                        │  Investments,    │
                        │  Liabilities)    │
                        └──────────────────┘
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/clients` | GET, POST | Manage clients |
| `/api/client-items/{clientId}` | GET | Get bank connections for client |
| `/api/plaid-link-token` | POST | Generate Plaid Link token |
| `/api/plaid-webhook` | POST | Handle Plaid webhooks |
| `/api/transactions` | GET | List transactions with filters |
| `/api/transactions/sync/{itemId}` | POST | Trigger transaction sync |
| `/api/liabilities` | GET | Get liability data |
| `/api/investments` | GET | Get holdings and investment transactions |

## Database Schema

Core tables:
- `clients` - CPA client records
- `items` - Bank connections (Plaid Items)
- `accounts` - Individual bank accounts
- `transactions` - Transaction history
- `securities` - Global securities data
- `holdings` - Investment positions per account
- `investment_transactions` - Buy/sell/dividend history
- `liabilities_credit` - Credit card details
- `liabilities_student` - Student loan details
- `liabilities_mortgage` - Mortgage details

## Security

- Plaid access tokens encrypted via Azure Key Vault
- Azure AD authentication for CPA users
- Soft-delete patterns preserve audit trails
- Webhook signature verification

## Environment Variables

```
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=sandbox|production

AZURE_SQL_CONNECTION_STRING=
AZURE_KEY_VAULT_URL=

AAD_CLIENT_ID=
AAD_CLIENT_SECRET=
```

## Local Development

```bash
# Install dependencies
cd api && npm install
cd frontend && npm install

# Run backend
cd api && npm start

# Run frontend
cd frontend && npm start
```

## Deployment

Deployed via GitHub Actions to Azure Static Web Apps. Push to `main` triggers automatic build and deployment.

## Plaid Products Used

- **Transactions** - Bank transaction history with categorization
- **Liabilities** - Credit card, student loan, mortgage data
- **Investments** - Holdings, securities, investment transactions
- **Link** - Hosted Link for secure bank connections

## License

Private - Meade CPA