# Fertilizer Billing Starter

Stack: Java 25, Spring Boot, React/Vite, PostgreSQL. Billing is runtime-only: no invoice/bill/history table and no bill insert. Includes shared product catalogue, dealer-specific GST-inclusive prices, dynamic rows, editable per-bill price, bag/weight calculation, GST calculation, preview and browser print/PDF. Other modules are placeholders.

## Requirements
JDK 25, Maven 3.9+, Node.js 20+, PostgreSQL.

## Database
Create `fertilizer_db`, then run `database/schema.sql`. Set `DB_URL`, `DB_USERNAME`, `DB_PASSWORD` if needed. Defaults: `jdbc:postgresql://localhost:5432/fertilizer_db`, `fertilizer_app`, `change_me`.

## Run
Terminal 1: `cd backend && mvn spring-boot:run`
Terminal 2: `cd frontend && npm install && npm run dev`
Open http://localhost:5173. Local demo login `admin` / `admin123`.

## Important
This is a development starter, not production-ready. Demo login is hard-coded and is not secure; replace with Spring Security, password hashing, proper authenticated dealer scoping and tests before any network exposure. Demo product prices/dealer data are illustrative. Tax/place-of-supply logic is simplified and must be reviewed before real use. No generated bill is stored in PostgreSQL.
