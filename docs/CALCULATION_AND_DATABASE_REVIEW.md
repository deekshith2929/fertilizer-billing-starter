# Calculation and Database Connection Review

**Project:** Agri Dealer Hub  
**Review date:** 1 November 2026  
**Scope:** GST / bill calculation, related money and quantity math, and how the app connects to PostgreSQL.  
**Method:** Source review of billing, customer ledger, supplier ledger, stock report, company price lists, `application.yml`, and Flyway/Hikari settings. There are **no automated calculation tests** in the repository.

This is a findings document, not a code change list.

---

## 1. How bill calculation works today

Bills are calculated on the **server** in `BillingService.calculate`. The browser sends packs and **price including GST**. The server does not trust a client-side tax total.

For each line:

1. Line total (gross) = price including GST × number of packs, rounded to 2 decimal places.
2. Taxable value = gross × 100 ÷ (100 + GST %), rounded to 2 decimal places (HALF_UP).
3. Tax = gross − taxable.
4. If the customer state code matches the dealer state code: CGST = tax ÷ 2 (rounded **down**), SGST = leftover tax. Otherwise the full tax is IGST.
5. Quantity (kg/ltr) = pack size × packs, rounded to 3 decimal places.

Catalogue products take **name, HSN, pack size, and GST % from the database**. Only the inclusive price and pack count come from the screen. One-off (“Other”) products take GST %, pack size, and name from the screen.

Grand total is the sum of inclusive line totals, not taxable + tax recomputed at bill level.

---

## 2. Confirmed calculation bugs

### 2.1 Print preview “Rate” is not the same as the stored taxable rate (High)

On the generated bill, the **Amount** column and **Net amount** are displayed rounded to the nearest whole rupee; the underlying server values retain paise precision. The **Rate** column is computed in the browser as:

inclusive price ÷ (1 + GST%/100), then **rounded to the nearest whole rupee**.

Example using a demo product: DAP at ₹1,245 including 5% GST, 1 pack.

| Figure | Value |
|---|---|
| Server taxable (also Amount) | ₹1,185.71 |
| Rate shown on the print preview | ₹1,186 |
| Rate × packs | ₹1,186, which does not equal Amount |

A dealer or inspector reading Rate × quantity will not match Net amount. Saved invoices in Farmer Ledger show the inclusive rate, so **preview and saved invoice can disagree**.

**Where:** billing print preview in `frontend/src/App.jsx`.

---

### 2.2 Editing a cash invoice changes the farmer’s balance (High)

A **new cash bill** is stored as:

- a bill entry (increases amount due by the total), and  
- a matching cash settlement (decreases amount due by the same total),

so the balance stays unchanged.

A **later invoice edit** only posts an **adjustment for the difference**. It does not change the original cash settlement.

| Action | Effect on amount due |
|---|---|
| Save cash bill of ₹1,000 | +1,000 bill and −1,000 settlement → **₹0** |
| Edit that cash bill to ₹1,200 | +₹200 adjustment → **₹200 due** (wrong for a cash bill) |
| Edit that cash bill to ₹800 | −₹200 credit → farmer shows an **advance** (wrong for a cash bill) |

The edit confirmation text always talks about amount due / account credit, including for cash invoices.

**Where:** `CustomerLedgerRepository.updateInvoice` and the invoice-edit confirm copy on Farmer / Customer Ledger.

---

### 2.3 Server bill-type label is wrong (Medium)

The calculation API returns:

- Credit → `"Credit Bill"`
- Anything else, including Cash → `"Cash / CreditBill"` (missing space, and it is not a real bill type)

The database correctly stores `CASH` or `CREDIT` from the **request**, not from this label. The billing screen overwrites the API label with the form value, so the UI usually looks fine. Any other consumer of `/api/billing/calculate` would get a misleading type. Cash vs credit is **not** used in the GST math (only for ledger posting).

**Where:** `BillingService.calculate`.

---

### 2.4 Invoice date follows the server clock, not India calendar date (Medium)

Saved invoice date is taken from `OffsetDateTime.now()` on the server, converted to a calendar date.

If the hosting server is on UTC (typical on Render), bills saved in India between **midnight and 5:30 AM IST** get **yesterday’s date**.

Runtime preview does not print a bill date from this field; the problem appears on **saved** customer invoices and ledger entries that use that date.

---

### 2.5 CGST and SGST can differ by ₹0.01 (Low, expected with current rounding)

Intra-state tax is split with CGST rounded **down** and SGST taking the remainder. A 1-paisa difference (e.g. CGST ₹29.64 and SGST ₹29.65 on DAP ₹1,245) is possible.

Taxable + CGST + SGST (or IGST) still equals the inclusive line total. This is a presentation / statutory-split issue, not a grand-total leak. Some Indian invoices put the odd paisa on CGST instead; this app always puts it on SGST.

---

### 2.6 Place-of-supply is only a 2-character string compare (Medium, design limit with bug risk)

Inter-state vs intra-state is `destinationStateCode` vs dealer `state_code`, case-insensitive.

| Risk | What happens |
|---|---|
| State code not padded (`7` vs `07`) | Treated as inter-state → IGST |
| Letters instead of GST state codes (`AP` vs `37`) | Treated as inter-state → IGST |
| Blank destination | Dealer state is used → always CGST+SGST |
| Dealer state later changed | **Editing** an old invoice recalculates tax type from the **current** dealer state and the **old** destination code |

There is no GSTIN-based place of supply, no SEZ, and no check that the code is a valid GST state code on **calculate**. Save-to-customer only checks that a non-blank code is two digits.

---

### 2.7 Quantity on the bill preview is shown with money rounding (Low)

Line quantity is calculated to **3** decimal places on the server. The preview formats that number with the rupee formatter (0–2 decimal places). Pack sizes that are not whole kilograms can display as 12.35 when the stored quantity is 12.345.

---

### 2.8 Cash vs credit is not recalculated into tax; invoice edits ignore live catalogue GST (Info)

Invoice corrections always recalculate as **one-off lines** using the GST % and pack size stored on the invoice, not a fresh catalogue lookup. That is reasonable for history, but if a product’s GST rate was wrong on the original bill, editing quantity/price will **keep the wrong GST %** unless the user cannot change it (the edit form does not expose GST).

---

## 3. Related money / quantity math (not the GST engine)

### 3.1 Company price lists — GST check is a warning, not a hard block

Inclusive price is checked as: ex-GST × (1 + GST%/100), compared with a **₹0.02** tolerance. A mismatch is a review note (`NEEDS_REVIEW`), not a refused save. The helper on the screen uses JavaScript floating-point (`amount * (1 + gst/100)`), while billing uses `BigDecimal` reverse calculation. Small differences between a typed inclusive price and a derived one are expected.

### 3.2 Stock report closing stock (looks correct)

Closing = opening + receipts − sales, using thousandths of a unit (`× 1000` then integer math). Sales cannot exceed opening + receipts. This avoids typical `0.1 + 0.2` JavaScript errors. Stock is **not** tied to billing, so billed bags never reduce this report automatically (product behaviour, not a formula bug).

### 3.3 Supplier and farmer running balances (looks correct for credit)

| Ledger | Balance meaning |
|---|---|
| Farmer | Sum of (debit − credit); positive = amount due |
| Supplier | Sum of (credit − debit); positive = payable |

Date filters still compute running balance from **all** entries, then hide rows outside the dates. That is the right approach so a mid-period opening figure is not lost.

Opening, purchase, payment, and adjustment signs were checked and match the screens.

The remaining ledger math defect is **cash invoice edit** (section 2.2), not the running-balance SQL.

### 3.4 Invoice-edit projected total on the confirm dialog (Low)

The confirm dialog multiplies inclusive rate × packs in the browser. Actual tax and totals are recalculated on the server after save. The dialog says “approximately” and is usually equal to the new grand total because grand total **is** inclusive rate × packs. Tax lines can still change independently of that total.

---

## 4. Database connection findings

### 4.1 Default JDBC URL points at a hosted Neon pooler (High)

In `backend/src/main/resources/application.yml`:

- The local URL (`localhost:5432/fertilizer_db`) is **commented out**.
- The active default is a **Neon pooled** host: `ep-bitter-fog-a1jdxyp2-pooler.ap-southeast-1.aws.neon.tech`, database `neondb`, user default `neondb_owner`.
- Password is only `${DB_PASSWORD}` (no default). If that environment variable is missing, Spring Boot **fails to start**.
- README still says local defaults `fertilizer_app` / `change_me`.

Effects:

- A developer following the README can fail to connect or, worse, **talk to the shared hosted database** if `DB_PASSWORD` is set in the environment.
- Host name and user are in source control. Rotate Neon credentials if this project is shared.

---

### 4.2 Neon **pooler** + Hikari is a fragile pairing (High)

The host name includes `-pooler`, which is Neon’s PgBouncer-style pool.

Typical failures with this combination:

| Symptom | Likely cause |
|---|---|
| `prepared statement already exists` / `does not exist` | Transaction-mode pooler + JDBC prepared statements |
| Random `connection is closed` / I/O errors | Hikari `max-lifetime` is **25 minutes**; poolers often recycle sooner |
| Session settings not sticking | `SET search_path` / schema on a pooled connection |

The URL does **not** include `sslmode=require` (Neon normally needs SSL) or `prepareThreshold=0` (common fix for pooler + JDBC).

Hikari settings of note:

| Setting | Value | Comment |
|---|---|---|
| `schema` | `NF` | Relies on PostgreSQL `search_path` / `setSchema` |
| `maximum-pool-size` | 10 | Fine for a small app; pooler has its own cap |
| `connection-timeout` | 30s | OK |
| `max-lifetime` | 1,500,000 ms (25 min) | Often too long for Neon pooler |
| `keepalive-time` | 300,000 ms (5 min) | Helps idle drops |
| Flyway `create-schemas` | `false` | Schema `NF` must already exist or startup fails |

---

### 4.3 Schema `NF` vs unqualified SQL (High when search_path is wrong)

Flyway is told to use schema `NF` (`default-schema` and `schemas`). Almost all SQL (including `nextval('customer_invoice_number_seq')`) is **unqualified**. That only works if every connection’s search path includes `NF`.

If Hikari schema, Flyway schema, and the real PostgreSQL schema (`NF` vs `nf`) disagree, typical errors are:

- `relation "user_roles" does not exist` (login)
- `relation "customer_invoice_number_seq" does not exist` (save bill — **calculate can still succeed** because it does not use the sequence)

PostgreSQL folds unquoted names to lowercase. A quoted `"NF"` schema and an unquoted `nf` schema are **different**. This is a known operational failure mode for this project.

`calculate` can work while **Save bill to customer** fails, because only save allocates `customer_invoice_number_seq`.

---

### 4.4 Password and local/prod mix-up (Medium)

| Item | What the code does | What README says |
|---|---|---|
| JDBC URL | Neon pooler unless `DB_URL` is set | Local `fertilizer_db` |
| Username | `neondb_owner` unless `DB_USERNAME` is set | `fertilizer_app` |
| Password | Required env `DB_PASSWORD` | Default `change_me` |
| Schema | `NF`, Flyway will not create it | “Create `fertilizer_db`, then run `schema.sql`” |

Local `schema.sql` and Flyway migrations can also **diverge**; running both on the same database is another source of “table exists / missing” connection-time errors, not a formula bug.

---

### 4.5 What is not a connection bug

- Repositories use `JdbcTemplate` and most write paths are `@Transactional` (user create, product create, invoice save). A failed second insert should roll back if a transaction is active.
- Login and billing both use the same datasource; there is no second unused database config.
- CORS / session cookies can block the browser from calling the API; that is not a PostgreSQL failure. Location capture uses a **different** default origin (`FRONTEND_ORIGIN_LOCATION`) than the rest of the app.

---

## 5. Worked GST example (engine vs preview)

**Inputs:** 1 pack, ₹1,245.00 incl. GST, GST 5%, same state as dealer.

| Step | Result |
|---|---|
| Gross | 1,245.00 |
| Taxable | 1,245.00 × 100 / 105 = 1,185.714… → **1,185.71** |
| Tax | 1,245.00 − 1,185.71 = **59.29** |
| CGST | 59.29 / 2, round down → **29.64** |
| SGST | 59.29 − 29.64 → **29.65** |
| Total | **1,245.00** (correct) |
| Preview Rate | round(1,245 / 1.05) → **1,186** (incorrect vs taxable) |

The **tax engine’s grand total is internally consistent**. The **printed Rate column is not**.

---

## 6. What looks sound

- Inclusive-price reverse GST is applied on the server with `BigDecimal`, not in the browser.
- Catalogue GST % is loaded from the database, not from a hidden field the cashier can tamper with.
- Packs must be at least 1; inclusive price must be &gt; 0.
- Intra-state: taxable + CGST + SGST = gross. Inter-state: taxable + IGST = gross.
- Credit farmer posting uses the recalculated grand total.
- Stock closing math uses integer thousandths.
- Supplier payable vs advance signs match the opening-balance options.

---

## 7. Suggested checks (manual)

There are no unit tests. Before treating billing as production-ready, walk through:

1. DAP 1 pack at default ₹1,245, 5% GST, same state — confirm Rate, Amount, CGST, SGST, Total on printout.
2. Same bill, destination state code different from the dealer — confirm IGST only, no CGST/SGST.
3. 3 packs of Urea ₹266.00 — confirm quantity 135.000 and totals.
4. Custom product, GST 0% — taxable should equal inclusive total; tax 0.
5. Custom product, GST 18%, price ₹100.00, 2 packs.
6. Save as **credit**, then edit packs — farmer due should move by the difference.
7. Save as **cash**, then edit packs — farmer due should **stay zero** (currently it will not).
8. Save a customer bill around 00:30 IST if the API host is UTC — check invoice date.
9. Stop the app, unset `DB_URL`, start backend — confirm which database it actually opens.
10. On a DB where search_path is not `NF`, calculate a bill (may work) then save (may fail on the invoice sequence).

---

## 8. Priority summary

| ID | Area | Severity | Summary |
|---|---|---|---|
| C1 | Billing preview | High | Rate column rounded to whole rupees; does not match taxable Amount |
| C2 | Customer ledger | High | Cash invoice edit posts an adjustment and changes amount due |
| C3 | Billing API | Medium | Cash bills labelled `"Cash / CreditBill"` in the calculate response |
| C4 | Invoice date | Medium | Date from server timezone; UTC host shifts late-night IST bills |
| C5 | Place of supply | Medium | Raw string compare; bad/short codes flip the bill to IGST; edits can change tax type |
| C6 | CGST/SGST split | Low | 1-paisa imbalance by design of round-down |
| C7 | Quantity display | Low | 3-decimal qty shown with 2-decimal money format |
| D1 | Datasource default | High | Hard-coded Neon pooler URL and user; README does not match |
| D2 | Pooler + Hikari | High | No SSL / prepareThreshold settings; long max lifetime |
| D3 | Schema `NF` | High | Unqualified SQL and `nextval` depend on search_path; save-bill can fail after a successful calculate |
| D4 | Env vs README | Medium | Password required; local defaults documented but not configured |

**Bottom line:** Inclusive GST **totals** from the calculation service are consistent. Do not trust the **printed Rate** column, **cash invoice corrections**, **invoice calendar date** on a UTC host, or a **default database URL** that points at Neon instead of a local database.
