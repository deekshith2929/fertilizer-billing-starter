# Agri Dealer Hub — Technical and Functional Documentation

## 1. Purpose and scope

Agri Dealer Hub is a dealer-oriented fertilizer and agricultural-product application. It provides product and price maintenance, GST bill calculation, printable stock reports, supplier and customer ledgers, user/dealer administration, and dealer-specific company price-list review.

This document describes the implementation currently present in this repository. It distinguishes database-backed workflows from browser/runtime-only workflows. It is not tax, accounting, or regulatory advice.

## 2. Technology and architecture

| Layer | Implementation |
|---|---|
| Frontend | React, Vite, JavaScript/JSX; single-page application |
| Backend | Java 25, Spring Boot REST controllers and services |
| Database | PostgreSQL, accessed through Spring JDBC |
| Schema changes | Flyway SQL migrations under `backend/src/main/resources/db/migration` |
| Authentication | Server-side HTTP session cookie; user ID is stored in the session |
| API root | `/api` |
| Frontend API URL | `VITE_API_BASE_URL`; defaults differ between development and production, see `frontend/src/api.js` and README |

The frontend is in `frontend/src`. Backend features are organized under `backend/src/main/java/com/example/fertilizer`. `database/schema.sql` describes a fresh-install schema and seeds demo data; the ordered Flyway migrations evolve an existing database.

The active backend configuration uses `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`. Hikari and Flyway are configured for schema `NF` in `application.yml`. Check that the application and migration runner point to the same database/schema when troubleshooting missing-relation errors. The README's local database setup instructions and the fallback values in `application.yml` should be checked against the deployment environment.

## 3. Authentication, roles, and permissions

### 3.1 Authentication model

1. `POST /api/auth/login` verifies an active user and PBKDF2-SHA256 password hash.
2. On success, the server changes the session ID, stores the user ID in the session, and returns user identity, dealer, role, and current permissions.
3. Protected APIs reload the active user and permissions from the database for each request.
4. `POST /api/auth/logout` invalidates the session.

The frontend uses returned permissions to display navigation and controls. Backend controllers also enforce permissions; hiding a page in the UI is not the authorization boundary.

### 3.2 Built-in roles

| Role | Intended user | Dealer assignment and scope |
|---|---|---|
| `ADMIN` | Platform administrator | Normally not assigned to a dealer. Can create/manage dealers and users and can select a dealer in supported modules. It does not automatically receive billing, product, ledger, or price-list permissions. |
| `DEALER` | Dealer owner/operator | Assigned to one dealer. Its dealer data is scoped to that dealer. Can manage employee accounts for its dealer. |
| `EMPLOYEE` | Dealer staff member | Assigned to one dealer. Can access the day-to-day working modules granted to this role but cannot administer users or dealers. |

The application selects a primary role for display if a user has multiple rows in `user_roles`. API permissions are resolved from role-to-permission assignments. `AuthorizationService` prevents a non-admin from requesting another dealer's data and requires an active dealer for dealer-scoped operations.

### 3.3 Default permission matrix

The following is the default access matrix seeded by `database/schema.sql` and Flyway migrations. Database assignments can be changed independently.

| Permission | ADMIN | DEALER | EMPLOYEE | Main use |
|---|:---:|:---:|:---:|---|
| `DEALER_MANAGE` | Yes | No | No | Create/list dealers; global user administration; dealer selection for supported pages |
| `USER_MANAGE` | Yes | Yes | No | List, create, update, password-reset, and deactivate users within permitted scope |
| `BILLING_USE` | No | Yes | Yes | Calculate bills; together with customer-ledger permission, save a bill as an invoice |
| `PRODUCT_VIEW` | No | Yes | Yes | Read dealer products for API consumers such as billing |
| `PRODUCT_MANAGE` | No | Yes | Yes | Product catalog operations and Products navigation |
| `DEALER_PRICE_MANAGE` | No | Yes | Yes | Create/update dealer product prices; some product operations require both this and product management |
| `STOCK_REPORT_VIEW` | No | Yes | Yes | Stock Report navigation |
| `COMPANY_LEDGER_VIEW` | No | Yes | Yes | Supplier/company ledger access |
| `CUSTOMER_LEDGER_VIEW` | No | Yes | Yes | Customer ledger access |
| `DEALER_PRICE_LIST_VIEW` | No | Yes | No | View dealer company price lists, search, history, and comments |
| `DEALER_PRICE_LIST_MANAGE` | No | Yes | No | Import and maintain price lists, including review and revisions |

The two price-list permissions were introduced by migration V14 and are assigned to `DEALER`. The Company Price Lists page is also explicitly restricted to users whose role is `DEALER`.

Dealer user managers can create, edit, reset passwords for, and deactivate employee accounts in their own dealer. They cannot create or promote users to `ADMIN` or manage users in another dealer. Deactivation retains user and transaction records.

## 4. Functional modules

### 4.1 Login and navigation

- Login uses username and password; invalid credentials produce an authentication error.
- Navigation items are shown when the user has at least one of the permissions associated with the page. Company Price Lists additionally requires the `DEALER` role.
- The header displays the signed-in user and dealer when assigned.
- Logout invalidates the server session.

### 4.2 Billing

**Purpose:** Calculate a cash or credit bill with GST and provide a printable/previewable bill.

- Product rows use the signed-in dealer's active catalog and default GST-inclusive price. A price can be overridden for the current calculation without changing the catalog.
- Rows support pack count, quantity calculation from package size, and custom one-off products.
- Custom products are used only for the current calculation and are not added to the catalog.
- The backend calculates taxable value from GST-inclusive price, then applies CGST/SGST for same-state sales or IGST for inter-state sales. The destination state defaults to the dealer state unless supplied.
- The calculation endpoint is `POST /api/billing/calculate`. The backend verifies `BILLING_USE` and requires the requested dealer to match the user's dealer.
- A calculated bill is runtime-only until explicitly saved to a selected customer using `POST /api/customer-ledger/bills`. Saved bills are available as customer invoices.
- The UI remembers bill type and destination-state code in browser `sessionStorage`.
- Billing and tax/place-of-supply calculations are intentionally simplified; review the rules before production use.

### 4.3 Products and dealer prices

**Purpose:** Maintain each dealer's product catalog and default GST-inclusive prices.

- Product fields include dealer, product code, name, brand, HSN, category, package size, and GST rate.
- Product and price records are dealer-scoped. An administrator may select a dealer where the page supports it; dealer users are restricted to their own dealer.
- Products can be created, updated, deactivated, and restored. Deactivation preserves rows rather than deleting them.
- Product prices are stored separately from product details. Price maintenance requires `DEALER_PRICE_MANAGE`; a product update that does not change price may be allowed with `PRODUCT_MANAGE` alone.
- Billing reads active products/prices. Stock Report filters active catalog products by `Fertilizer` or `Pesticide`.
- Endpoints: `GET /api/products` for the billing catalog; `/api/product-management/products` for management, price updates, deactivation, and restore.

### 4.4 Stock Report

**Purpose:** Prepare a printable stock statement for a date range and either fertilizer or pesticide products.

- The user selects a report type, dates, and products, then enters opening stock, receipts, and sales.
- Closing stock is calculated as `opening + receipts - sales`. Sales cannot exceed opening stock plus receipts; quantities are non-negative and limited to three decimal places.
- Products can be selected from the dealer catalog, or entered as runtime-only products.
- The report is generated and printed/saved to PDF in the browser. The stock rows are not sent to the backend or stored in PostgreSQL.
- The latest report's dates and rows can be reused from browser `sessionStorage`, keyed by dealer. This is a convenience shortcut, not a server-side stock ledger.
- Optional stamp/signature images are read in the browser and included in the print output; they are not uploaded or stored by the backend.
- There is no stock-report backend controller or stock-report table in the current implementation; `StockPlaceholder` is only a placeholder class.

### 4.5 Company / Dealer Ledger (supplier ledger)

**Purpose:** Track supplier balances independently of stock.

- Create supplier accounts with contact details.
- Record one opening balance and dated purchase/invoice and payment entries with references and notes.
- Entries are represented as debit/credit amounts; the page displays the resulting payable or advance balance.
- Existing entries can be corrected. Each actual edit snapshots old and updated values, editor, and timestamp in the edit-history table.
- Date-range filters and printable statements are available.
- The optional browser-side document reader can use OCR to prefill fields from an image or PDF. The document is processed in the browser and is not sent to the backend; extracted values must be checked.
- OCR uses Tesseract.js worker and English-language assets downloaded from jsDelivr when required. Those are OCR engine assets; the selected supplier document is not uploaded.
- This ledger does not update inventory or stock.
- API base: `/api/company-ledger`.

### 4.6 Farmer / Customer Ledger

**Purpose:** Maintain customer accounts, payments, balances, and saved invoices.

- Create dealer-scoped customer records.
- Record opening balances, payments, and adjustments. Entries are stored as debit/credit amounts and displayed as amount due or customer advance.
- View customer entries with date filtering.
- Save a calculated bill as a customer invoice. A credit bill increases the amount due; a cash bill is retained in invoice history with a matching settlement so it does not increase the balance.
- Invoice lines store snapshots of product name, HSN, package size, quantity, GST, rates, and tax amounts. Custom bill products remain invoice snapshots and do not become catalog products.
- Invoice lines can be edited, repriced, or removed for returns. An edit requires a reason; before/after totals and line snapshots are retained. The corresponding ledger balance is adjusted by the invoice-total difference.
- Invoices and ledger statements can be printed.
- API base: `/api/customer-ledger`. Saving a bill requires both `BILLING_USE` and `CUSTOMER_LEDGER_VIEW`.

### 4.7 Company Price Lists

**Purpose:** Maintain supplier company price lists and compare current confirmed prices.

- Upload a completed standard `.xlsx`, `.xls`, or `.csv` template for review. The feature does not parse supplier PDFs or images directly; the conversion prompt supports preparing a standard template externally.
- Imported rows are drafts until reviewed and the complete report is confirmed. Rows may be edited, bulk-excluded, or bulk-included/marked `READY`.
- Confirmed imports may update current prices, or may be confirmed as history without changing current values.
- A single manual price can be added for an existing/new company. GST-inclusive and ex-GST amounts can be calculated from one another when the rate is supplied.
- Current-price search supports normalized trade/technical-name search plus company and equivalent-unit-size filters.
- Import lifecycle: `REVIEW` imports can be edited, included/excluded, and confirmed or cancelled. Only confirmed rows marked `READY` can be used as current prices; confirming as history retains the list without changing current values.
- Row actions expose history, comments (loaded from the item-specific endpoint), editing where permitted, and adding a selected price to the product catalog where the user has the required product permissions.
- Price-list managers can permanently delete a company and all its associated audit records, items, imports, and company row from the Companies list. This operation is dealer-scoped, transactional, and requires UI confirmation.
- Current-price search can export the filtered result set to an Excel workbook or a print-ready PDF. Exports omit row actions and are capped at 500 matching rows; PDF export uses the browser print dialog and can be saved as a PDF.
- Replacing a current price retains history and writes audit data. Uploaded file contents are parsed in memory and not retained; filename and SHA-256 are retained for import identification and duplicate-upload rejection.
- API base: `/api/dealer-price-lists`. The module is dealer-scoped.

### 4.8 Administration

**Purpose:** Manage dealerships and user accounts.

- A global administrator can create/list active dealers, with address and optional AGL/PL numbers.
- Administrators can create users for dealers or create unassigned administrators, update user details/role, reset passwords, and deactivate accounts.
- Dealer users with `USER_MANAGE` can create/manage employee accounts for their own dealership only.
- Passwords are hashed by the backend; password hashes are never returned to the frontend.
- API base: `/api/admin`.

### 4.9 Location capture API

`POST /api/location-captures` accepts latitude, longitude, accuracy in meters, and capture timestamp. The record is stored without user/dealer identifiers. The full submitted JSON payload is retained in the `comments` field. The endpoint is not represented as a main application page.

## 5. Database table and sequence dictionary

All application tables below are defined in `database/schema.sql` and/or Flyway migrations. Most business records carry a `dealer_id` directly or are linked through a dealer-owned parent. Composite foreign keys on several tables enforce dealer-consistent relationships.

### 5.1 Identity and authorization

| Table | Used for | Important relationships/data |
|---|---|---|
| `dealers` | Dealership master and billing/report header details | Dealer code, legal/display names, address, state code, GSTIN, phone, AGL/PL numbers, active flag |
| `app_users` | Login identities and user status | Unique username, password hash, full name, optional `dealer_id`, active flag |
| `roles` | Named application roles | Role code (`ADMIN`, `DEALER`, `EMPLOYEE`) and display name |
| `permissions` | Fine-grained capability catalog | Permission code and description |
| `user_roles` | Many-to-many assignment of roles to users | Links `app_users` to `roles` |
| `role_permissions` | Many-to-many assignment of permissions to roles | Links `roles` to `permissions` |

### 5.2 Product catalog and supplier ledger

| Table | Used for | Important relationships/data |
|---|---|---|
| `products` | Dealer-owned product master | Product code/name, brand, HSN, category, package size in kg, GST, active flag; unique product code per dealer |
| `dealer_product_prices` | Default product prices | One dealer-specific GST-inclusive default price per product; linked to the same dealer's product |
| `suppliers` | Supplier/company accounts | Supplier name/code, contact information, address, dealer scope, active flag |
| `supplier_ledger_entries` | Supplier opening, purchase, and payment transactions | Entry type/date, reference, notes, debit/credit, creator; at most one opening entry per supplier |
| `supplier_ledger_entry_edits` | Audit snapshots of supplier-entry changes | Previous and updated entry fields, editor, and edit timestamp |

### 5.3 Customer ledger and invoices

| Table or sequence | Used for | Important relationships/data |
|---|---|---|
| `customer_invoice_number_seq` (sequence) | Generates unique invoice number components | Used when issuing customer invoices |
| `customers` | Dealer-owned customer accounts | Name, phone, email, address, GSTIN, state code, active flag |
| `customer_invoices` | Saved bill header and immutable party/tax snapshots | Invoice number/date, dealer and customer snapshots, cash/credit type, destination/tax type, totals, creator |
| `customer_invoice_items` | Saved invoice line snapshots | Product link when catalog-backed, product/HSN snapshot, package size, bags, quantity, rate, GST and tax totals |
| `customer_ledger_entries` | Customer opening, bill, payment, and adjustment entries | Debit/credit amounts; optional link to invoice; creator and date |
| `customer_invoice_edits` | Invoice-edit audit header | Required reason, before/after totals, editor, timestamp, dealer/customer/invoice links |
| `customer_invoice_edit_items` | Before/after invoice-line snapshots for each edit | Snapshot side, line number and product/tax/quantity/rate values |

### 5.4 Dealer company price lists

| Table | Used for | Important relationships/data |
|---|---|---|
| `dealer_price_list_companies` | Normalized company/supplier names for price comparison | Dealer-scoped unique normalized name and display name |
| `dealer_price_lists` | Uploaded/manual price-list import header and review lifecycle | Company, effective date/period, source, filename/hash, status, uploader, confirmation metadata |
| `dealer_price_list_items` | Price rows and current-price snapshots | Trade/technical names and normalized forms, source unit and equivalent match unit, prices/GST/MRP, comments, review status, current flag |
| `dealer_price_list_item_audit` | Links prior/new rows and records price-change events | Event type, changed-fields JSON, reason, user and timestamp |

`dealer_price_list_items.review_status` is `READY`, `NEEDS_REVIEW`, or `EXCLUDED`. Current-row uniqueness is enforced per dealer, company, normalized product identity, and equivalent unit size.

### 5.5 Other data

| Table | Used for | Important data |
|---|---|---|
| `location_captures` | Standalone location-capture submissions | Latitude, longitude, accuracy, captured timestamp, submitted payload in `comments`, created timestamp |

Flyway also creates its own `flyway_schema_history` metadata table in the configured schema. It tracks migration versions and is infrastructure metadata, not an application business table. Stock reports, unsaved bills, and product rows entered only for a one-off bill/report have no application table.

## 6. API route index

All routes are under `/api`. Routes not listed here are not implied by the page descriptions; check the corresponding controller for request/response fields.

| Feature | Routes |
|---|---|
| Auth | `POST /auth/login`, `POST /auth/logout` |
| Billing | `POST /billing/calculate` |
| Product read | `GET /products` |
| Product management | `GET/POST /product-management/products`; `PUT /product-management/products/{productId}`; `PUT /product-management/products/{productId}/price`; `DELETE /product-management/products/{productId}`; `PUT /product-management/products/{productId}/restore` |
| Admin | `GET/POST /admin/dealers`; `GET /admin/users`; `GET /admin/roles`; `POST /admin/users`; `PUT /admin/users/{userId}`; `PUT /admin/users/{userId}/password`; `DELETE /admin/users/{userId}` |
| Supplier ledger | `GET/POST /company-ledger/suppliers`; `GET/POST /company-ledger/suppliers/{supplierId}/entries`; `PUT /company-ledger/suppliers/{supplierId}/entries/{entryId}`; `GET /company-ledger/suppliers/{supplierId}/entries/{entryId}/history` |
| Customer ledger | `GET/POST /customer-ledger/customers`; `GET/POST /customer-ledger/customers/{customerId}/entries`; `POST /customer-ledger/bills`; `GET/PUT /customer-ledger/customers/{customerId}/invoices/{invoiceId}`; `GET /customer-ledger/customers/{customerId}/invoices/{invoiceId}/edits` |
| Company price lists | `GET /dealer-price-lists/template`, `/prompt`, `/companies`, `/technical-names`, `/imports`, `/imports/{importId}`, `/audit`; `DELETE /dealer-price-lists/companies/{companyId}`; `POST /dealer-price-lists/imports`; `PUT /dealer-price-lists/imports/{importId}/items/{itemId}`; `POST /dealer-price-lists/imports/{importId}/items/exclude`, `/dealer-price-lists/imports/{importId}/items/include`, `/dealer-price-lists/imports/{importId}/confirm`, `/dealer-price-lists/imports/{importId}/cancel`; `GET/POST /dealer-price-lists/items`; `GET /dealer-price-lists/items/export.xlsx`; `GET /dealer-price-lists/items/{itemId}/history`, `/dealer-price-lists/items/{itemId}/comments`; `POST /dealer-price-lists/items/{itemId}/revisions` |
| Location capture | `POST /location-captures` |

The Company Price Lists UI also supports:

- `GET /dealer-price-lists/items?search=...&companyId=...` for name/company search.
- Current-price searches return up to 500 rows; unit-size filtering is applied to those results in the frontend.
- `GET /dealer-price-lists/items/export.xlsx` exports the same name/company/equivalent-unit filters, with the same 500-row cap. Exported workbooks contain no Actions column.
- PDF export is generated from the currently filtered results in a print-ready browser window; choose Save as PDF in the print dialog.
- `GET /dealer-price-lists/items/{itemId}/comments` for comments shown in the row popup.

## 7. Data retention and behavior summary

| Data/action | Persisted? | Where/how |
|---|---|---|
| Catalog products and default prices | Yes | `products`, `dealer_product_prices` |
| Calculated bill without saving to a customer | No | Current browser runtime only |
| Bill explicitly saved to a customer | Yes | Customer invoice, line, and ledger tables |
| One-off custom billing product | Not in catalog | Saved only as invoice-line snapshot if the bill is saved |
| Stock report rows | No server persistence | Browser runtime; previous report shortcut uses session storage |
| Supplier ledger transactions | Yes | Supplier ledger tables and edit history |
| Customer ledger entries/invoices | Yes | Customer ledger and invoice tables |
| Confirmed company prices and history | Yes | Price-list item and audit tables |
| Original uploaded price-list file | No | Parsed in memory; filename and hash retained |
| Supplier document used for OCR | No server upload | Read and processed in the browser |
| Stock report stamp/signature image | No server upload | Read in browser and included in print output |
| Location capture request | Yes | `location_captures`, including the serialized payload |

## 8. Operational and implementation notes

- Use Flyway migrations for deployed schema changes. `database/schema.sql` is a fresh-install snapshot and seed script, not a replacement for applying ordered migrations to an existing database.
- Keep the configured database, Flyway schema, and Hikari schema aligned. PostgreSQL resolves unqualified names such as `user_roles` through the active `search_path`.
- To diagnose a `relation "user_roles" does not exist` error, run this on the same connection/database used by the failing application request:

  ```sql
  SELECT current_database(), current_schema(), current_schemas(true),
         to_regclass('user_roles'), to_regclass('nf.user_roles'),
         to_regclass('"NF".user_roles');

  SELECT table_schema, table_name
  FROM information_schema.tables
  WHERE table_name = 'user_roles';
  ```

  This shows whether the application is connected to the expected database and whether the table is visible in the configured schema/search path.
- Configure the exact frontend origin for credentialed CORS and use HTTPS with secure session cookies in production.
- The README identifies the demo account `admin` / `admin123`; disable or replace it before deployment.
- The project README identifies this as a development starter. In particular, billing tax logic is simplified, stock is not a persisted inventory system, and it calls out that other billing/product endpoints still need authenticated dealer scoping before network exposure. Reassess those limitations and the current controller authorization behavior before production deployment.
- The configured CORS/session values and API URL are environment-dependent. See `backend/src/main/resources/application.yml`, `frontend/src/api.js`, and README deployment instructions.

## 9. Source map

| Area | Main source paths |
|---|---|
| SPA navigation and billing | `frontend/src/App.jsx` |
| Product management | `frontend/src/pages/ProductsPage.jsx`; `backend/.../product` |
| Stock report | `frontend/src/pages/StockPage.jsx`; `backend/.../stock` currently contains only a placeholder |
| Supplier ledger | `frontend/src/pages/CompanyLedgerPage.jsx`; `backend/.../companyledger` |
| Customer ledger | `frontend/src/pages/CustomerLedgerPage.jsx`; `backend/.../customerledger` |
| Company price lists | `frontend/src/pages/DealerPriceListsPage.jsx`; `backend/.../dealerpricelist` |
| Administration | `frontend/src/pages/AdminPage.jsx`; `backend/.../admin` |
| Authentication and permission resolution | `backend/.../auth` |
| Database snapshot and migrations | `database/schema.sql`; `backend/src/main/resources/db/migration` |
