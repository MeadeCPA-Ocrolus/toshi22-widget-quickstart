# Azure SQL schema (as it exists today)

Generated from catalog queries run in the Azure SQL query editor on 2026-11-20. This is a factual description of the **current Azure database**, not a design. Use it with `postgres-draft.sql`, which is a mechanical (not yet tested against the app) translation.

- 17 base tables, 3 views, 17 foreign keys, 87 non-primary-key indexes.
- No check constraints. No triggers. No computed columns.
- Nothing in this file is data. All data in Azure is test data and is not being migrated.

## Views

Three views, with their definitions exactly as exported (T-SQL):

### vw_holdings_with_securities

```sql
CREATE VIEW vw_holdings_with_securities AS
SELECT 
    h.holding_id,
    h.account_id,
    h.security_id,
    h.plaid_account_id,
    h.plaid_security_id,
    h.quantity,
    h.cost_basis,
    h.institution_price,
    h.institution_price_as_of,
    h.institution_price_datetime,
    h.institution_value,
    h.iso_currency_code,
    h.unofficial_currency_code,
    h.vested_quantity,
    h.vested_value,
    h.is_archived,
    h.created_at,
    h.updated_at,
    -- Security details
    s.name AS security_name,
    s.ticker_symbol,
    s.security_type,
    s.security_subtype,
    s.sector,
    s.industry,
    s.close_price,
    s.close_price_as_of,
    s.is_cash_equivalent,
    s.market_identifier_code,
    s.option_contract,
    s.fixed_income,
    -- Account details
    a.account_name,
    a.account_type,
    a.account_subtype,
    a.item_id
FROM holdings h
JOIN securities s ON h.security_id = s.security_id
JOIN accounts a ON h.account_id = a.account_id;
```

### vw_investment_transactions_with_securities

```sql
CREATE VIEW vw_investment_transactions_with_securities AS
SELECT 
    it.investment_transaction_id,
    it.account_id,
    it.security_id,
    it.plaid_investment_transaction_id,
    it.plaid_account_id,
    it.plaid_security_id,
    it.cancel_transaction_id,
    it.transaction_date,
    it.name,
    it.amount,
    it.quantity,
    it.price,
    it.fees,
    it.transaction_type,
    it.transaction_subtype,
    it.iso_currency_code,
    it.unofficial_currency_code,
    it.is_archived,
    it.created_at,
    it.updated_at,
    -- Security details (may be NULL for cash transactions)
    s.name AS security_name,
    s.ticker_symbol,
    s.security_type,
    s.security_subtype,
    s.sector,
    s.industry,
    -- Account details
    a.account_name,
    a.account_type,
    a.account_subtype,
    a.item_id
FROM investment_transactions it
LEFT JOIN securities s ON it.security_id = s.security_id
JOIN accounts a ON it.account_id = a.account_id;
```

### vw_failed_link_attempts

```sql
CREATE VIEW vw_failed_link_attempts AS
SELECT 
    lt.link_token,
    lt.client_id,
    c.first_name + ' ' + c.last_name AS client_name,
    c.email AS client_email,
    lt.status AS link_status,
    lt.last_session_status,
    lt.last_session_error_code,
    lt.last_session_error_message,
    ISNULL(lt.attempt_count, 0) AS attempt_count,
    lt.created_at AS link_created_at,
    lt.expires_at AS link_expires_at,
    lt.used_at AS last_attempt_at,  -- Changed from updated_at
    CASE 
        WHEN lt.status = 'used' THEN 'completed'
        WHEN lt.expires_at < GETDATE() THEN 'expired'
        WHEN lt.last_session_status IN ('EXITED', 'REQUIRES_CREDENTIALS', 'REQUIRES_QUESTIONS', 'REQUIRES_SELECTIONS') THEN 'needs_retry'
        WHEN lt.last_session_status IS NULL THEN 'pending'
        ELSE 'unknown'
    END AS action_needed
FROM link_tokens lt
JOIN clients c ON lt.client_id = c.client_id
WHERE lt.status != 'used'
  AND lt.expires_at > DATEADD(DAY, -7, GETDATE());
```

## Tables

### accounts

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `account_id` | int | no |  | identity, PK |
| 2 | `item_id` | int | no |  |  |
| 3 | `plaid_account_id` | nvarchar(100) | no |  |  |
| 4 | `account_name` | nvarchar(255) | yes |  |  |
| 5 | `official_name` | nvarchar(255) | yes |  |  |
| 6 | `account_type` | nvarchar(50) | no |  |  |
| 7 | `account_subtype` | nvarchar(100) | yes |  |  |
| 8 | `current_balance` | decimal(18,2) | yes |  |  |
| 9 | `available_balance` | decimal(18,2) | yes |  |  |
| 10 | `credit_limit` | decimal(18,2) | yes |  |  |
| 11 | `is_active` | bit | yes | `((1))` |  |
| 12 | `closed_at` | datetime2(7) | yes |  |  |
| 13 | `include_in_cash_on_hand` | bit | yes | `((1))` |  |
| 14 | `include_in_operating_metrics` | bit | yes | `((1))` |  |
| 15 | `last_updated_datetime` | datetime2(7) | yes |  |  |
| 16 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 17 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |
| 18 | `mask` | varchar(10) | yes |  |  |

Indexes:

- `idx_account_subtype` — index on (account_subtype)
- `idx_account_type` — index on (account_type)
- `idx_accounts_is_active` — index on (is_active)
- `idx_is_active` — index on (is_active)
- `idx_item_id` — index on (item_id)
- `idx_plaid_account_id` — index on (plaid_account_id)
- `IX_accounts_item_type_mask` — index on (item_id, account_type, account_subtype, mask)
- `PK__accounts__46A222CD0CD46BE3` — PRIMARY KEY on (account_id)
- `UQ__accounts__8FBDE4EE77287525` — UNIQUE on (plaid_account_id)

Foreign keys:

- `item_id` → `items.item_id` (on delete no action)

### client_external_ids

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `id` | int | no |  | identity, PK |
| 2 | `client_uuid` | uniqueidentifier | no |  |  |
| 3 | `external_system` | nvarchar(50) | no |  |  |
| 4 | `external_id` | nvarchar(255) | no |  |  |
| 5 | `matched_by` | nvarchar(100) | yes |  |  |
| 6 | `match_method` | nvarchar(50) | yes |  |  |
| 7 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 8 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `idx_external_system_id` — index on (external_system, external_id)
- `PK__client_e__3213E83F692BB8AF` — PRIMARY KEY on (id)
- `UQ_client_external` — UNIQUE on (client_uuid, external_system)

Foreign keys:

- `client_uuid` → `clients.client_uuid` (on delete no action)

### clients

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `client_id` | int | no |  | identity, PK |
| 2 | `first_name` | nvarchar(100) | no |  |  |
| 3 | `last_name` | nvarchar(100) | no |  |  |
| 4 | `business_name` | nvarchar(255) | yes |  |  |
| 5 | `email` | nvarchar(255) | no |  |  |
| 6 | `phone_number` | nvarchar(20) | yes |  |  |
| 7 | `account_type` | nvarchar(50) | no |  |  |
| 8 | `fiscal_year_start_date` | date | no |  |  |
| 9 | `state` | nvarchar(2) | no |  |  |
| 10 | `federal_effective_tax_rate` | decimal(5,4) | yes |  |  |
| 11 | `state_effective_tax_rate` | decimal(5,4) | yes |  |  |
| 12 | `self_employment_tax_rate` | decimal(5,4) | yes |  |  |
| 13 | `blended_effective_tax_rate` | decimal(5,4) | yes |  |  |
| 14 | `target_tax_savings_percent` | decimal(5,4) | yes |  |  |
| 15 | `income_type` | nvarchar(50) | yes |  |  |
| 16 | `sync_status` | nvarchar(50) | yes | `('active')` |  |
| 17 | `last_synced` | datetime2(7) | yes |  |  |
| 19 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 20 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |
| 21 | `plaid_user_id` | varchar(100) | yes |  |  |
| 22 | `is_archived` | bit | no | `((0))` |  |
| 23 | `client_uuid` | uniqueidentifier | no | `(newid())` |  |

Indexes:

- `idx_account_type` — index on (account_type)
- `idx_clients_client_uuid` — index on (client_uuid)
- `idx_clients_is_archived` — index on (is_archived)
- `idx_email` — index on (email)
- `idx_state` — index on (state)
- `idx_sync_status` — index on (sync_status)
- `IX_clients_plaid_user_id` — UNIQUE on (plaid_user_id) WHERE `([plaid_user_id] IS NOT NULL)`
- `PK__clients__BF21A424FACE66A9` — PRIMARY KEY on (client_id)
- `UQ__clients__AB6E6164906EDDD3` — UNIQUE on (email)
- `UQ_clients_client_uuid` — UNIQUE on (client_uuid)

### documents

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `doc_id` | uniqueidentifier | no | `(newid())` | PK |
| 2 | `client_uuid` | uniqueidentifier | no |  |  |
| 3 | `tax_year` | int | no |  |  |
| 4 | `blob_path` | nvarchar(500) | no |  |  |
| 5 | `filename` | nvarchar(255) | no |  |  |
| 6 | `file_size` | bigint | no |  |  |
| 7 | `sha256_hash` | nvarchar(64) | no |  |  |
| 8 | `uploaded_by` | nvarchar(100) | no |  |  |
| 9 | `uploaded_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `idx_documents_client_uuid` — index on (client_uuid)
- `idx_documents_sha256` — index on (sha256_hash)
- `idx_documents_tax_year` — index on (tax_year)
- `PK__document__8AD02924B2349643` — PRIMARY KEY on (doc_id)

Foreign keys:

- `client_uuid` → `clients.client_uuid` (on delete no action)

### encryption_keys

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `key_id` | int | no |  | identity, PK |
| 2 | `key_name` | nvarchar(100) | no |  |  |
| 3 | `key_value` | varbinary(max) | no |  |  |
| 4 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 5 | `expires_at` | datetime2(7) | yes |  |  |
| 6 | `is_active` | bit | yes | `((1))` |  |

Indexes:

- `idx_is_active` — index on (is_active)
- `idx_key_name` — index on (key_name)
- `PK__encrypti__97DF9ACD21AA4279` — PRIMARY KEY on (key_id)
- `UQ__encrypti__846621D33AAF43C7` — UNIQUE on (key_name)

### holdings

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `holding_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `security_id` | int | no |  |  |
| 4 | `plaid_account_id` | nvarchar(100) | no |  |  |
| 5 | `plaid_security_id` | nvarchar(100) | no |  |  |
| 6 | `quantity` | decimal(19,6) | no |  |  |
| 7 | `cost_basis` | decimal(19,4) | yes |  |  |
| 8 | `institution_price` | decimal(19,6) | no |  |  |
| 9 | `institution_price_as_of` | date | yes |  |  |
| 10 | `institution_price_datetime` | datetime2(7) | yes |  |  |
| 11 | `institution_value` | decimal(19,4) | no |  |  |
| 12 | `iso_currency_code` | nvarchar(10) | yes |  |  |
| 13 | `unofficial_currency_code` | nvarchar(20) | yes |  |  |
| 14 | `vested_quantity` | decimal(19,6) | yes |  |  |
| 15 | `vested_value` | decimal(19,4) | yes |  |  |
| 16 | `is_archived` | bit | yes | `((0))` |  |
| 17 | `archived_at` | datetime2(7) | yes |  |  |
| 18 | `archive_reason` | nvarchar(100) | yes |  |  |
| 19 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 20 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_holdings_account_active` — index on (account_id, is_archived) WHERE `([is_archived]=(0))`
- `IX_holdings_account_id` — index on (account_id)
- `IX_holdings_is_archived` — index on (is_archived)
- `IX_holdings_plaid_account_id` — index on (plaid_account_id)
- `IX_holdings_security_id` — index on (security_id)
- `PK__holdings__9BA72FAE458216A5` — PRIMARY KEY on (holding_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)
- `security_id` → `securities.security_id` (on delete no action)

### investment_transactions

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `investment_transaction_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `security_id` | int | yes |  |  |
| 4 | `plaid_investment_transaction_id` | nvarchar(100) | no |  |  |
| 5 | `plaid_account_id` | nvarchar(100) | no |  |  |
| 6 | `plaid_security_id` | nvarchar(100) | yes |  |  |
| 7 | `cancel_transaction_id` | nvarchar(100) | yes |  |  |
| 8 | `transaction_date` | date | no |  |  |
| 9 | `name` | nvarchar(500) | yes |  |  |
| 10 | `amount` | decimal(19,4) | no |  |  |
| 11 | `quantity` | decimal(19,6) | no |  |  |
| 12 | `price` | decimal(19,6) | no |  |  |
| 13 | `fees` | decimal(19,4) | yes |  |  |
| 14 | `transaction_type` | nvarchar(50) | no |  |  |
| 15 | `transaction_subtype` | nvarchar(50) | yes |  |  |
| 16 | `iso_currency_code` | nvarchar(10) | yes |  |  |
| 17 | `unofficial_currency_code` | nvarchar(20) | yes |  |  |
| 18 | `is_archived` | bit | yes | `((0))` |  |
| 19 | `archived_at` | datetime2(7) | yes |  |  |
| 20 | `archive_reason` | nvarchar(100) | yes |  |  |
| 21 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 22 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_investment_transactions_account_date` — index on (account_id, transaction_date) WHERE `([is_archived]=(0))`
- `IX_investment_transactions_account_id` — index on (account_id)
- `IX_investment_transactions_date` — index on (transaction_date)
- `IX_investment_transactions_is_archived` — index on (is_archived)
- `IX_investment_transactions_plaid_account` — index on (plaid_account_id)
- `IX_investment_transactions_security_id` — index on (security_id)
- `IX_investment_transactions_type` — index on (transaction_type)
- `PK__investme__7EEC09C79A370F9E` — PRIMARY KEY on (investment_transaction_id)
- `UQ_investment_transactions_plaid_id` — UNIQUE on (plaid_investment_transaction_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)
- `security_id` → `securities.security_id` (on delete no action)

### items

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `item_id` | int | no |  | identity, PK |
| 2 | `client_id` | int | no |  |  |
| 3 | `plaid_item_id` | nvarchar(100) | no |  |  |
| 4 | `access_token` | varbinary(max) | no |  |  |
| 5 | `access_token_key_id` | int | no |  |  |
| 6 | `institution_id` | nvarchar(50) | yes |  |  |
| 7 | `institution_name` | nvarchar(200) | yes |  |  |
| 8 | `status` | nvarchar(50) | yes | `('active')` |  |
| 9 | `last_error_code` | nvarchar(100) | yes |  |  |
| 10 | `last_error_message` | nvarchar(max) | yes |  |  |
| 11 | `last_error_timestamp` | datetime2(7) | yes |  |  |
| 12 | `error_attempt_count` | int | yes | `((0))` |  |
| 13 | `consent_expiration_time` | datetime2(7) | yes |  |  |
| 14 | `transactions_cursor` | nvarchar(max) | yes |  |  |
| 15 | `transactions_cursor_last_updated` | datetime2(7) | yes |  |  |
| 16 | `historical_transactions_cursor` | nvarchar(max) | yes |  |  |
| 17 | `transactions_last_successful_update` | datetime2(7) | yes |  |  |
| 18 | `investments_last_successful_update` | datetime2(7) | yes |  |  |
| 19 | `has_sync_updates` | bit | yes | `((0))` |  |
| 20 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 21 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |
| 22 | `is_oauth` | bit | no | `((0))` |  |
| 23 | `is_archived` | bit | no | `((0))` |  |
| 24 | `liabilities_last_successful_update` | datetime2(7) | yes |  |  |
| 25 | `liabilities_error_code` | nvarchar(100) | yes |  |  |
| 26 | `investments_error_code` | nvarchar(100) | yes |  |  |
| 27 | `investment_transactions_last_synced_at` | datetime2(7) | yes |  |  |

Indexes:

- `idx_client_id` — index on (client_id)
- `idx_consent_expiration` — index on (consent_expiration_time)
- `idx_has_sync_updates` — index on (has_sync_updates)
- `idx_items_is_archived` — index on (is_archived)
- `idx_last_error_code` — index on (last_error_code)
- `idx_plaid_item_id` — index on (plaid_item_id)
- `idx_status` — index on (status)
- `IX_items_is_oauth` — index on (is_oauth) WHERE `([is_oauth]=(1))`
- `PK__items__52020FDD1868D82E` — PRIMARY KEY on (item_id)
- `UQ__items__F5B0BB98A3070F91` — UNIQUE on (plaid_item_id)

Foreign keys:

- `access_token_key_id` → `encryption_keys.key_id` (on delete no action)
- `client_id` → `clients.client_id` (on delete no action)

### liabilities_credit

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `credit_liability_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `is_overdue` | bit | yes | `((0))` |  |
| 4 | `last_payment_amount` | decimal(19,4) | yes |  |  |
| 5 | `last_payment_date` | date | yes |  |  |
| 6 | `last_statement_balance` | decimal(19,4) | yes |  |  |
| 7 | `last_statement_issue_date` | date | yes |  |  |
| 8 | `minimum_payment_amount` | decimal(19,4) | yes |  |  |
| 9 | `next_payment_due_date` | date | yes |  |  |
| 10 | `is_archived` | bit | yes | `((0))` |  |
| 11 | `archived_at` | datetime2(7) | yes |  |  |
| 12 | `archive_reason` | nvarchar(100) | yes |  |  |
| 13 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 14 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_liabilities_credit_account` — index on (account_id)
- `IX_liabilities_credit_archived` — index on (is_archived)
- `IX_liabilities_credit_overdue` — index on (is_overdue) WHERE `([is_overdue]=(1))`
- `PK__liabilit__5231CABE3B13A2AF` — PRIMARY KEY on (credit_liability_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)

### liabilities_credit_aprs

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `apr_id` | int | no |  | identity, PK |
| 2 | `credit_liability_id` | int | no |  |  |
| 3 | `apr_percentage` | decimal(7,4) | yes |  |  |
| 4 | `apr_type` | nvarchar(50) | yes |  |  |
| 5 | `balance_subject_to_apr` | decimal(19,4) | yes |  |  |
| 6 | `interest_charge_amount` | decimal(19,4) | yes |  |  |
| 7 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 8 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_credit_aprs_liability` — index on (credit_liability_id)
- `PK__liabilit__0FAA411BA48660C5` — PRIMARY KEY on (apr_id)

Foreign keys:

- `credit_liability_id` → `liabilities_credit.credit_liability_id` (on delete cascade)

### liabilities_mortgage

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `mortgage_liability_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `account_number` | nvarchar(100) | yes |  |  |
| 4 | `loan_type_description` | nvarchar(100) | yes |  |  |
| 5 | `loan_term` | nvarchar(50) | yes |  |  |
| 6 | `origination_date` | date | yes |  |  |
| 7 | `origination_principal_amount` | decimal(19,4) | yes |  |  |
| 8 | `maturity_date` | date | yes |  |  |
| 9 | `interest_rate_percentage` | decimal(7,4) | yes |  |  |
| 10 | `interest_rate_type` | nvarchar(20) | yes |  |  |
| 11 | `property_address_city` | nvarchar(100) | yes |  |  |
| 12 | `property_address_country` | nvarchar(50) | yes |  |  |
| 13 | `property_address_postal_code` | nvarchar(20) | yes |  |  |
| 14 | `property_address_region` | nvarchar(50) | yes |  |  |
| 15 | `property_address_street` | nvarchar(255) | yes |  |  |
| 16 | `has_pmi` | bit | yes |  |  |
| 17 | `has_prepayment_penalty` | bit | yes |  |  |
| 18 | `escrow_balance` | decimal(19,4) | yes |  |  |
| 19 | `last_statement_balance` | decimal(19,4) | yes |  |  |
| 20 | `current_late_fee` | decimal(19,4) | yes |  |  |
| 21 | `past_due_amount` | decimal(19,4) | yes |  |  |
| 22 | `last_payment_amount` | decimal(19,4) | yes |  |  |
| 23 | `last_payment_date` | date | yes |  |  |
| 24 | `next_monthly_payment` | decimal(19,4) | yes |  |  |
| 25 | `next_payment_due_date` | date | yes |  |  |
| 26 | `ytd_interest_paid` | decimal(19,4) | yes |  |  |
| 27 | `ytd_principal_paid` | decimal(19,4) | yes |  |  |
| 28 | `is_archived` | bit | yes | `((0))` |  |
| 29 | `archived_at` | datetime2(7) | yes |  |  |
| 30 | `archive_reason` | nvarchar(100) | yes |  |  |
| 31 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 32 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_liabilities_mortgage_account` — index on (account_id)
- `IX_liabilities_mortgage_archived` — index on (is_archived)
- `IX_liabilities_mortgage_pastdue` — index on (past_due_amount) WHERE `([past_due_amount]>(0))`
- `PK__liabilit__66EBCC9585995CFA` — PRIMARY KEY on (mortgage_liability_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)

### liabilities_student

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `student_liability_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `account_number` | nvarchar(100) | yes |  |  |
| 4 | `loan_name` | nvarchar(255) | yes |  |  |
| 5 | `origination_date` | date | yes |  |  |
| 6 | `origination_principal_amount` | decimal(19,4) | yes |  |  |
| 7 | `expected_payoff_date` | date | yes |  |  |
| 8 | `guarantor` | nvarchar(255) | yes |  |  |
| 9 | `interest_rate_percentage` | decimal(7,4) | yes |  |  |
| 10 | `loan_status_type` | nvarchar(50) | yes |  |  |
| 11 | `loan_status_end_date` | date | yes |  |  |
| 12 | `repayment_plan_type` | nvarchar(100) | yes |  |  |
| 13 | `repayment_plan_description` | nvarchar(255) | yes |  |  |
| 14 | `last_statement_balance` | decimal(19,4) | yes |  |  |
| 15 | `last_statement_issue_date` | date | yes |  |  |
| 16 | `outstanding_interest_amount` | decimal(19,4) | yes |  |  |
| 17 | `is_overdue` | bit | yes | `((0))` |  |
| 18 | `last_payment_amount` | decimal(19,4) | yes |  |  |
| 19 | `last_payment_date` | date | yes |  |  |
| 20 | `minimum_payment_amount` | decimal(19,4) | yes |  |  |
| 21 | `next_payment_due_date` | date | yes |  |  |
| 22 | `ytd_interest_paid` | decimal(19,4) | yes |  |  |
| 23 | `ytd_principal_paid` | decimal(19,4) | yes |  |  |
| 24 | `servicer_address_city` | nvarchar(100) | yes |  |  |
| 25 | `servicer_address_country` | nvarchar(50) | yes |  |  |
| 26 | `servicer_address_postal_code` | nvarchar(20) | yes |  |  |
| 27 | `servicer_address_region` | nvarchar(50) | yes |  |  |
| 28 | `servicer_address_street` | nvarchar(255) | yes |  |  |
| 29 | `disbursement_dates` | nvarchar(max) | yes |  |  |
| 30 | `is_archived` | bit | yes | `((0))` |  |
| 31 | `archived_at` | datetime2(7) | yes |  |  |
| 32 | `archive_reason` | nvarchar(100) | yes |  |  |
| 33 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 34 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_liabilities_student_account` — index on (account_id)
- `IX_liabilities_student_archived` — index on (is_archived)
- `IX_liabilities_student_overdue` — index on (is_overdue) WHERE `([is_overdue]=(1))`
- `PK__liabilit__62FBB5768AB2AE12` — PRIMARY KEY on (student_liability_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)

### link_sessions

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `session_id` | int | no |  | identity, PK |
| 2 | `link_token` | nvarchar(255) | no |  |  |
| 3 | `link_session_id` | varchar(100) | yes |  |  |
| 4 | `status` | varchar(50) | no |  |  |
| 5 | `error_code` | varchar(100) | yes |  |  |
| 6 | `error_message` | varchar(500) | yes |  |  |
| 7 | `error_type` | varchar(100) | yes |  |  |
| 8 | `institution_id` | varchar(50) | yes |  |  |
| 9 | `institution_name` | varchar(100) | yes |  |  |
| 10 | `created_at` | datetime | yes | `(getdate())` |  |

Indexes:

- `IX_link_sessions_link_token` — index on (link_token)
- `IX_link_sessions_status` — index on (status)
- `PK__link_ses__69B13FDC732CFE9B` — PRIMARY KEY on (session_id)

Foreign keys:

- `link_token` → `link_tokens.link_token` (on delete no action)

### link_tokens

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `link_token` | nvarchar(255) | no |  | PK |
| 2 | `client_id` | int | no |  |  |
| 3 | `status` | nvarchar(50) | yes | `('pending')` |  |
| 4 | `hosted_link_url` | nvarchar(500) | yes |  |  |
| 5 | `expires_at` | datetime2(7) | no |  |  |
| 6 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 7 | `used_at` | datetime2(7) | yes |  |  |
| 8 | `last_session_status` | varchar(50) | yes |  |  |
| 9 | `last_session_error_code` | varchar(100) | yes |  |  |
| 10 | `last_session_error_message` | varchar(500) | yes |  |  |
| 11 | `attempt_count` | int | yes | `((0))` |  |
| 12 | `link_session_id` | varchar(100) | yes |  |  |

Indexes:

- `idx_client_id` — index on (client_id)
- `idx_expires_at` — index on (expires_at)
- `idx_status` — index on (status)
- `PK__link_tok__05BD6D132B9EE4F6` — PRIMARY KEY on (link_token)

Foreign keys:

- `client_id` → `clients.client_id` (on delete no action)

### securities

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `security_id` | int | no |  | identity, PK |
| 2 | `plaid_security_id` | nvarchar(100) | no |  |  |
| 3 | `isin` | nvarchar(20) | yes |  |  |
| 4 | `cusip` | nvarchar(20) | yes |  |  |
| 5 | `institution_security_id` | nvarchar(100) | yes |  |  |
| 6 | `institution_id` | nvarchar(50) | yes |  |  |
| 7 | `proxy_security_id` | nvarchar(100) | yes |  |  |
| 8 | `name` | nvarchar(500) | yes |  |  |
| 9 | `ticker_symbol` | nvarchar(50) | yes |  |  |
| 10 | `market_identifier_code` | nvarchar(10) | yes |  |  |
| 11 | `security_type` | nvarchar(50) | yes |  |  |
| 12 | `security_subtype` | nvarchar(100) | yes |  |  |
| 13 | `sector` | nvarchar(100) | yes |  |  |
| 14 | `industry` | nvarchar(100) | yes |  |  |
| 15 | `close_price` | decimal(19,6) | yes |  |  |
| 16 | `close_price_as_of` | date | yes |  |  |
| 17 | `update_datetime` | datetime2(7) | yes |  |  |
| 18 | `iso_currency_code` | nvarchar(10) | yes |  |  |
| 19 | `unofficial_currency_code` | nvarchar(20) | yes |  |  |
| 20 | `is_cash_equivalent` | bit | yes | `((0))` |  |
| 21 | `option_contract` | nvarchar(max) | yes |  |  |
| 22 | `fixed_income` | nvarchar(max) | yes |  |  |
| 23 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 24 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `IX_securities_cusip` — index on (cusip) WHERE `([cusip] IS NOT NULL)`
- `IX_securities_isin` — index on (isin) WHERE `([isin] IS NOT NULL)`
- `IX_securities_security_type` — index on (security_type)
- `IX_securities_ticker_symbol` — index on (ticker_symbol)
- `PK__securiti__46647BD1C5F96CFE` — PRIMARY KEY on (security_id)
- `UQ_securities_plaid_security_id` — UNIQUE on (plaid_security_id)

### transactions

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `transaction_id` | int | no |  | identity, PK |
| 2 | `account_id` | int | no |  |  |
| 3 | `plaid_transaction_id` | nvarchar(100) | no |  |  |
| 4 | `transaction_date` | date | no |  |  |
| 5 | `transaction_datetime` | datetime2(7) | yes |  |  |
| 6 | `posted_date` | date | yes |  |  |
| 7 | `authorized_date` | date | yes |  |  |
| 8 | `merchant_name` | nvarchar(255) | yes |  |  |
| 9 | `original_description` | nvarchar(500) | yes |  |  |
| 10 | `merchant_logo_url` | nvarchar(500) | yes |  |  |
| 11 | `merchant_website` | nvarchar(500) | yes |  |  |
| 12 | `amount` | decimal(18,2) | no |  |  |
| 13 | `iso_currency_code` | nvarchar(10) | yes | `('USD')` |  |
| 14 | `payment_channel` | nvarchar(50) | yes |  |  |
| 15 | `transaction_code` | nvarchar(50) | yes |  |  |
| 16 | `pending` | bit | yes | `((0))` |  |
| 17 | `is_transfer` | bit | yes | `((0))` |  |
| 18 | `transaction_status` | nvarchar(50) | yes | `('added')` |  |
| 19 | `is_removed` | bit | yes | `((0))` |  |
| 20 | `plaid_primary_category` | nvarchar(100) | yes |  |  |
| 21 | `plaid_detailed_category` | nvarchar(100) | yes |  |  |
| 22 | `plaid_confidence_score` | decimal(5,4) | yes |  |  |
| 23 | `category_verified` | bit | yes | `((0))` |  |
| 24 | `final_category` | nvarchar(100) | yes | `('not_verified')` |  |
| 25 | `processed_into_ledger` | bit | yes | `((0))` |  |
| 26 | `updated_since_process` | bit | yes | `((0))` |  |
| 27 | `sync_status` | nvarchar(50) | yes | `('not_ready')` |  |
| 28 | `created_at` | datetime2(7) | yes | `(getdate())` |  |
| 29 | `updated_at` | datetime2(7) | yes | `(getdate())` |  |
| 30 | `is_archived` | bit | no | `((0))` |  |
| 31 | `archived_at` | datetime | yes |  |  |
| 32 | `archive_reason` | varchar(50) | yes |  |  |
| 33 | `manually_verified` | bit | yes | `((0))` |  |
| 34 | `manual_primary_category` | nvarchar(100) | yes |  |  |
| 35 | `manual_detailed_category` | nvarchar(100) | yes |  |  |

Indexes:

- `idx_account_id` — index on (account_id)
- `idx_category_verified` — index on (category_verified)
- `idx_is_transfer` — index on (is_transfer)
- `idx_merchant_name` — index on (merchant_name)
- `idx_pending` — index on (pending)
- `idx_plaid_confidence_score` — index on (plaid_confidence_score)
- `idx_plaid_transaction_id` — index on (plaid_transaction_id)
- `idx_posted_date` — index on (posted_date)
- `idx_processed_into_ledger` — index on (processed_into_ledger)
- `idx_sync_status` — index on (sync_status)
- `idx_transaction_date` — index on (transaction_date)
- `idx_transactions_is_archived` — index on (is_archived)
- `PK__transact__85C600AF82970129` — PRIMARY KEY on (transaction_id)
- `UQ__transact__DFCAD099A567C9C2` — UNIQUE on (plaid_transaction_id)

Foreign keys:

- `account_id` → `accounts.account_id` (on delete no action)

### webhook_log

| # | Column | Type | Null | Default | Notes |
|---|---|---|---|---|---|
| 1 | `log_id` | int | no |  | identity, PK |
| 2 | `webhook_type` | nvarchar(100) | no |  |  |
| 3 | `webhook_code` | nvarchar(100) | no |  |  |
| 4 | `item_id` | int | yes |  |  |
| 5 | `plaid_item_id` | nvarchar(100) | yes |  |  |
| 6 | `payload` | nvarchar(max) | no |  |  |
| 7 | `processed` | bit | yes | `((0))` |  |
| 8 | `processed_at` | datetime2(7) | yes |  |  |
| 9 | `error_message` | nvarchar(max) | yes |  |  |
| 10 | `webhook_id` | nvarchar(255) | no |  |  |
| 11 | `created_at` | datetime2(7) | yes | `(getdate())` |  |

Indexes:

- `idx_created_at` — index on (created_at)
- `idx_item_id` — index on (item_id)
- `idx_processed` — index on (processed)
- `idx_webhook_code` — index on (webhook_code)
- `idx_webhook_id` — index on (webhook_id)
- `idx_webhook_type` — index on (webhook_type)
- `PK__webhook___9E2397E0DE0A8514` — PRIMARY KEY on (log_id)
- `UQ__webhook___895D8FC60796F1AD` — UNIQUE on (webhook_id)

Foreign keys:

- `item_id` → `items.item_id` (on delete no action)

## Redundant duplicate indexes

Same table, same columns, same filter. One of each pair is not needed.

- `accounts` (is_active): `idx_accounts_is_active`, `idx_is_active`
- `accounts` (plaid_account_id): `idx_plaid_account_id`, `UQ__accounts__8FBDE4EE77287525`
- `clients` (client_uuid): `idx_clients_client_uuid`, `UQ_clients_client_uuid`
- `clients` (email): `idx_email`, `UQ__clients__AB6E6164906EDDD3`
- `encryption_keys` (key_name): `idx_key_name`, `UQ__encrypti__846621D33AAF43C7`
- `items` (plaid_item_id): `idx_plaid_item_id`, `UQ__items__F5B0BB98A3070F91`
- `transactions` (plaid_transaction_id): `idx_plaid_transaction_id`, `UQ__transact__DFCAD099A567C9C2`
- `webhook_log` (webhook_id): `idx_webhook_id`, `UQ__webhook___895D8FC60796F1AD`

## Still missing

- Nothing known. Check this file against the live database again before relying on it for the final schema.
