CREATE SEQUENCE customer_invoice_number_seq START WITH 1 INCREMENT BY 1;

CREATE TABLE customers (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL REFERENCES dealers(id),
    customer_name VARCHAR(200) NOT NULL,
    phone VARCHAR(30),
    email VARCHAR(200),
    address VARCHAR(2000),
    gstin VARCHAR(15),
    state_code VARCHAR(2),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dealer_id, id)
);

CREATE UNIQUE INDEX uq_customers_dealer_name
    ON customers (dealer_id, LOWER(customer_name));

CREATE TABLE customer_invoices (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    invoice_number VARCHAR(40) NOT NULL,
    invoice_date DATE NOT NULL,
    customer_name VARCHAR(200) NOT NULL,
    customer_phone VARCHAR(30),
    customer_address VARCHAR(2000),
    customer_gstin VARCHAR(15),
    dealer_name VARCHAR(200) NOT NULL,
    dealer_address_line1 VARCHAR(200) NOT NULL,
    dealer_address_line2 VARCHAR(200),
    dealer_city VARCHAR(100) NOT NULL,
    dealer_state_name VARCHAR(100) NOT NULL,
    dealer_pincode VARCHAR(10),
    dealer_gstin VARCHAR(15),
    bill_type VARCHAR(10) NOT NULL CHECK (bill_type IN ('CASH', 'CREDIT')),
    destination_state_code VARCHAR(2) NOT NULL,
    tax_type VARCHAR(10) NOT NULL CHECK (tax_type IN ('IGST', 'CGST_SGST')),
    taxable_total NUMERIC(14, 2) NOT NULL CHECK (taxable_total >= 0),
    cgst_total NUMERIC(14, 2) NOT NULL CHECK (cgst_total >= 0),
    sgst_total NUMERIC(14, 2) NOT NULL CHECK (sgst_total >= 0),
    igst_total NUMERIC(14, 2) NOT NULL CHECK (igst_total >= 0),
    grand_total NUMERIC(14, 2) NOT NULL CHECK (grand_total > 0),
    created_by BIGINT NOT NULL REFERENCES app_users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dealer_id, invoice_number),
    UNIQUE (dealer_id, id),
    FOREIGN KEY (dealer_id, customer_id) REFERENCES customers(dealer_id, id)
);

CREATE INDEX idx_customer_invoices
    ON customer_invoices (dealer_id, customer_id, invoice_date DESC, id DESC);

CREATE TABLE customer_invoice_items (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    invoice_id BIGINT NOT NULL,
    line_number INTEGER NOT NULL CHECK (line_number > 0),
    product_id BIGINT,
    product_name VARCHAR(200) NOT NULL,
    hsn_code VARCHAR(20) NOT NULL,
    bag_size_kg NUMERIC(12, 3) NOT NULL CHECK (bag_size_kg > 0),
    bags INTEGER NOT NULL CHECK (bags > 0),
    quantity_kg NUMERIC(14, 3) NOT NULL CHECK (quantity_kg > 0),
    rate_incl_gst NUMERIC(14, 2) NOT NULL CHECK (rate_incl_gst > 0),
    gst_rate NUMERIC(5, 2) NOT NULL CHECK (gst_rate BETWEEN 0 AND 100),
    taxable_amount NUMERIC(14, 2) NOT NULL CHECK (taxable_amount >= 0),
    cgst_amount NUMERIC(14, 2) NOT NULL CHECK (cgst_amount >= 0),
    sgst_amount NUMERIC(14, 2) NOT NULL CHECK (sgst_amount >= 0),
    igst_amount NUMERIC(14, 2) NOT NULL CHECK (igst_amount >= 0),
    line_total NUMERIC(14, 2) NOT NULL CHECK (line_total > 0),
    UNIQUE (invoice_id, line_number),
    FOREIGN KEY (dealer_id, invoice_id) REFERENCES customer_invoices(dealer_id, id),
    FOREIGN KEY (dealer_id, product_id) REFERENCES products(dealer_id, id)
);

CREATE TABLE customer_ledger_entries (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    invoice_id BIGINT,
    entry_type VARCHAR(20) NOT NULL CHECK (entry_type IN ('OPENING', 'BILL', 'PAYMENT', 'ADJUSTMENT')),
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
    FOREIGN KEY (dealer_id, customer_id) REFERENCES customers(dealer_id, id),
    FOREIGN KEY (dealer_id, invoice_id) REFERENCES customer_invoices(dealer_id, id)
);

CREATE UNIQUE INDEX uq_customer_opening_entry
    ON customer_ledger_entries (dealer_id, customer_id)
    WHERE entry_type = 'OPENING';

CREATE UNIQUE INDEX uq_customer_invoice_bill_entry
    ON customer_ledger_entries (dealer_id, invoice_id)
    WHERE entry_type = 'BILL';

CREATE INDEX idx_customer_ledger_date
    ON customer_ledger_entries (dealer_id, customer_id, entry_date, id);
