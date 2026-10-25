CREATE TABLE supplier_ledger_entry_edits (
    id BIGSERIAL PRIMARY KEY,
    ledger_entry_id BIGINT NOT NULL REFERENCES supplier_ledger_entries(id),
    changed_by BIGINT NOT NULL REFERENCES app_users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    previous_entry_type VARCHAR(20) NOT NULL,
    previous_entry_date DATE NOT NULL,
    previous_reference VARCHAR(100),
    previous_notes VARCHAR(1000),
    previous_debit_amount NUMERIC(14, 2) NOT NULL,
    previous_credit_amount NUMERIC(14, 2) NOT NULL,
    updated_entry_type VARCHAR(20) NOT NULL,
    updated_entry_date DATE NOT NULL,
    updated_reference VARCHAR(100),
    updated_notes VARCHAR(1000),
    updated_debit_amount NUMERIC(14, 2) NOT NULL,
    updated_credit_amount NUMERIC(14, 2) NOT NULL
);

CREATE INDEX idx_supplier_ledger_entry_edits
    ON supplier_ledger_entry_edits (ledger_entry_id, changed_at DESC, id DESC);
