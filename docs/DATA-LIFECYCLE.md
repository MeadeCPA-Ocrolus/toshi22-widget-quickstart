# How the app archives and removes data

Based on the code at the time of the Azure to VM migration. Describes **current behavior** only. Nothing here was changed. The port keeps this behavior unless the owner says otherwise.

## Short version

- Staff have three things in the app that look like removal. Two touch the database: **Delete Client** and **remove bank connection**. The third (the X and Clear all in the upload list) only tidies the on-screen list.
- None of them physically deletes rows. They set "archived" or "inactive" flags.
- **Both Delete Client and remove bank connection tell Plaid to disconnect.** If Plaid cannot be told, the data is still archived and the user sees a warning.
- `items.is_archived = 1` is the **one** meaning of "archived" for a bank connection, however it got archived.
- There is no way in the app to delete a document, transaction, account or link. Those change only through Plaid syncs and webhooks.
- The database blocks real deletes of a parent row that still has children. The only cascade is `liabilities_credit_aprs` to its parent `liabilities_credit` (see `database/schema/azure-sql-schema.md`).

## 1. Remove bank connection (the building block)

Frontend: `ClientDetail.tsx` (`handleDeleteItem`, trash icon, confirm pop-up) calls `DELETE /api/items/:id?removeFromPlaid=true`. The screen always sends the flag. API: `api/items/index.ts`, which calls `archiveItem` in `api/shared/archive-item.ts`. Delete Client uses the same function.

In order:
1. Decrypt the token and call Plaid `itemRemove`. If Plaid says it no longer knows the item (`ITEM_NOT_FOUND`, `INVALID_ACCESS_TOKEN`), that counts as removed. If it fails for another reason, or there is no stored token, the result is `failed` or `no_token` and everything below still happens.
2. `items.is_archived = 1`.
3. `accounts`: `is_active = 0`, `closed_at = now`.
4. `transactions`: `is_archived = 1` (with `archived_at` and `archive_reason`).
5. `holdings` and `investment_transactions`: archived (`archive_reason`).
6. `liabilities_credit`, `liabilities_student`, `liabilities_mortgage`: archived.

The response has `plaid_removal` (`removed`, `failed`, `no_token`) and, when Plaid could not be told, a `warning`. The screen shows the warning in a pop-up.

Not changed: `webhook_log`, `items.status`, link tokens.

## 2. Delete Client

Frontend: `EditClientDialog.tsx` asks for confirmation (it says bank connections will be disconnected at Plaid), then `DELETE /api/clients/:id` (`api/clients/index.ts`, `deleteClient`).

1. For each of the client's bank connections that is not archived, one at a time: everything in section 1, with `archive_reason = 'client_archived'`. A failure on one does not stop the others.
2. After all of them, `clients.is_archived = 1`. The client is archived last so a failure above can be retried.

| Data | Result |
|---|---|
| Client | Archived |
| Bank connections, accounts, transactions, holdings, investment transactions, liabilities | Archived or inactive (section 1) |
| **Plaid connections** | **Disconnected. If any could not be, the response has a `warning` and the connection may need to be removed in the Plaid dashboard.** |
| `documents` and the uploaded files | Not changed. The `documents` table has no archive column, so the document list returns nothing for an archived client; the files stay in storage. |
| `link_tokens`, `link_sessions`, `webhook_log` | Not changed (audit trail) |

After: the client disappears from lists, search, document upload, the document list and export.

## 3. Upload list: X and Clear all

`DocumentDropzone.tsx` (`removeLine`, `clearAll`) only edits the on-screen list. Nothing is deleted. A line shown as saved has already been stored and recorded.

There is no endpoint to delete or replace a saved document. The only document deletion is server-side: an upload that is rejected (empty, too large, wrong type) has its file deleted from storage (`api/documents/index.ts`, `rejectAndDelete`).

## 4. Things that happen without a click

| Trigger | Where | Result |
|---|---|---|
| Plaid webhook `USER_PERMISSION_REVOKED` | `api/plaid-webhook/index.ts` | `items.status = 'archived'` **and** `items.is_archived = 1`, accounts inactive, transactions, investments and liabilities archived (`archive_reason = 'item_archived'`). Plaid is not called (access is already revoked). The connection is hidden in the app like a removed one. |
| Same client links the same bank again | `api/plaid-webhook/index.ts` (duplicate prevention) | Only a connection that is **not archived** (`is_archived = 0` and `status != 'archived'`) counts as already linked. If so: Plaid `itemRemove` on the old item (best effort), existing row reused with the new token. A bank that was removed or revoked is not reused; a new connection is created. Re-linking the same Plaid connection in update mode sets `status = 'active'` and `is_archived = 0` again. |
| Accounts deselected in Plaid Link | `api/plaid-webhook/index.ts` | Accounts `is_active = 0`, transactions archived (`account_deselected`). |
| Plaid drops a pending transaction when it posts | `api/shared/transaction-sync-service.ts` | `is_removed = 1`, `transaction_status = 'removed'` (row kept). |
| Investments sync | `api/shared/investments-sync-service.ts` | Holdings and investment transactions not returned by Plaid archived (`not_in_plaid_response`). |
| Liabilities sync | `api/shared/liabilities-sync-service.ts` | Rows not returned by Plaid archived. `liabilities_credit_aprs` rows are physically deleted and re-inserted on every sync. |
| Link expiry | link tokens | Links expire after 4 hours. Not deleted. |
| Test code only | `api/shared/integration-test.ts` | `DELETE FROM items` (cleanup). |

Archive columns used by the syncs: `is_archived`, `archived_at`, `archive_reason`.

## 5. Not in the app

- No delete or archive for documents, transactions, accounts, link tokens or holdings.
- No restore or un-archive for a client or bank connection.
- No permanent purge. Archived data stays, including uploaded files.
- Editing a client, or categorizing and verifying a transaction, are edits, not deletions.

## 6. Known limits

- Transactions and investment transactions archived with a connection stay archived if the same Plaid connection is re-linked in update mode: the sync matches them by Plaid id but does not unarchive them. Holdings and liabilities get new rows from the next sync. This was already true when a client revoked access; removing a bank in the app now behaves the same way. A removed bank that is linked again as a new connection gets all-new rows and is not affected.
- Rows whose `status` is `archived` but `is_archived` is 0 (made before this change) are hidden by running `database/schema/one-off-backfill-archived-items.sql` once per database. Until then the duplicate check also looks at `status`.

## 7. Rules for the port

- Keep the soft-delete behavior and foreign keys exactly as they are.
- Do not add real deletion, cascades or a purge during the port.
- Do not change which rows the archive step touches without asking.
- Do not merge `is_archived` and `status`: re-linking in update mode relies on clearing both.
- Do not fix other gaps in these flows unless asked. Mention them in the pull request instead.
- Change this file in the same pull request as any change to these flows.
