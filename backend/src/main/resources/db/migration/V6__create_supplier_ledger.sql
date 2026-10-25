CREATE TABLE suppliers (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL REFERENCES dealers(id),
    supplier_name VARCHAR(200) NOT NULL,
    supplier_code VARCHAR(60),
    contact_name VARCHAR(200),
    phone VARCHAR(30),
    email VARCHAR(200),
    address TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dealer_id, id)
);

CREATE UNIQUE INDEX uq_suppliers_dealer_name
    ON suppliers (dealer_id, LOWER(supplier_name));

CREATE TABLE supplier_ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    supplier_id BIGINT NOT NULL,
    entry_type VARCHAR(20) NOT NULL
        CHECK (entry_type IN ('OPENING', 'PURCHASE', 'PAYMENT')),
    entry_date DATE NOT NULL,
    reference VARCHAR(100),
    notes VARCHAR(1000),
    debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
    credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
    created_by BIGINT NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (debit_amount > 0 AND credit_amount = 0)
        OR (credit_amount > 0 AND debit_amount = 0)
    ),
    FOREIGN KEY (dealer_id, supplier_id) REFERENCES suppliers(dealer_id, id)
);

CREATE UNIQUE INDEX uq_supplier_opening_entry
    ON supplier_ledger_entries (dealer_id, supplier_id)
    WHERE entry_type = 'OPENING';

CREATE UNIQUE INDEX uq_supplier_purchase_reference
    ON supplier_ledger_entries (dealer_id, supplier_id, LOWER(reference))
    WHERE entry_type = 'PURCHASE' AND reference IS NOT NULL;

CREATE INDEX idx_supplier_ledger_date
    ON supplier_ledger_entries (dealer_id, supplier_id, entry_date, id);
