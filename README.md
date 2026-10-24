# Fertilizer Billing Starter

Stack: Java 25, Spring Boot, React/Vite, PostgreSQL. Billing is runtime-only: no invoice/bill/history table and no bill insert. Includes dealer-specific product catalogs and GST-inclusive prices, dynamic rows, bill-only custom products that are not saved, editable per-bill price, bag/weight calculation, GST calculation, preview and browser print/PDF. Other modules are placeholders.

For a product that is not in the catalogue, choose **Other / enter manually…** in a bill row. Enter the product name, bag weight, GST rate and price; HSN code is optional. These details are used only for the current calculation and are not written to the product catalogue or database.

## Requirements
JDK 25, Maven 3.9+, Node.js 20+, PostgreSQL.

## Database
Create `fertilizer_db`, then run `database/schema.sql`. Set `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` if needed. Defaults: `jdbc:postgresql://localhost:5432/fertilizer_db`, `fertilizer_app`, `change_me`.

## Run
Terminal 1: `cd backend && mvn spring-boot:run`
Terminal 2: `cd frontend && npm install && npm run dev`
Open http://localhost:5173. The database is seeded with a demo account: `admin` / `admin123`. Login checks the active user, password hash, role, and dealer against PostgreSQL. New users must be stored in `app_users` with a PBKDF2-SHA256 password hash and linked to their role in `user_roles`.

Users with the `ADMIN` role see the Admin module after login. It supports creating dealers, creating users assigned to a dealer, changing user passwords, and deactivating accounts. Admin APIs require an active database-backed session and recheck the administrator role on every request. Passwords are hashed by the backend; the UI never stores password hashes.

Users with the `DEALER` or `ADMIN` role can open **Products** to create, edit, restore, and deactivate dealer-specific products, and to insert or update default prices. Dealer users are restricted to their own dealer; admins can select a dealer. Deletion deactivates the product and price instead of removing the database record. Flyway migration V3 gives existing products with dealer prices a dealer-owned catalog row, cloning products when they were priced for multiple dealers.

## Important
This is a development starter, not production-ready. The demo account is seeded with a known development password; replace or disable it before deployment. Admin sessions use an HTTP-only server session cookie; serve over HTTPS and configure production CORS origins before network exposure. Other billing/product endpoints still need authenticated dealer scoping before deployment. Demo product prices/dealer data are illustrative. Tax/place-of-supply logic is simplified and must be reviewed before real use. No generated bill is stored in PostgreSQL.
