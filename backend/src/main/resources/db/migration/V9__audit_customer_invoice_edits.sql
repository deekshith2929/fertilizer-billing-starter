CREATE TABLE customer_invoice_edits (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    customer_id BIGINT NOT NULL,
    invoice_id BIGINT NOT NULL,
    reason VARCHAR(1000) NOT NULL,
    previous_taxable_total NUMERIC(14, 2) NOT NULL,
    previous_cgst_total NUMERIC(14, 2) NOT NULL,
    previous_sgst_total NUMERIC(14, 2) NOT NULL,
    previous_igst_total NUMERIC(14, 2) NOT NULL,
    previous_grand_total NUMERIC(14, 2) NOT NULL,
    updated_taxable_total NUMERIC(14, 2) NOT NULL,
    updated_cgst_total NUMERIC(14, 2) NOT NULL,
    updated_sgst_total NUMERIC(14, 2) NOT NULL,
    updated_igst_total NUMERIC(14, 2) NOT NULL,
    updated_grand_total NUMERIC(14, 2) NOT NULL,
    edited_by BIGINT NOT NULL REFERENCES app_users(id),
    edited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dealer_id, customer_id) REFERENCES customers(dealer_id, id),
    FOREIGN KEY (dealer_id, invoice_id) REFERENCES customer_invoices(dealer_id, id)
);

CREATE INDEX idx_customer_invoice_edits
    ON customer_invoice_edits (dealer_id, customer_id, invoice_id, edited_at DESC, id DESC);

CREATE TABLE customer_invoice_edit_items (
    id BIGSERIAL PRIMARY KEY,
    edit_id BIGINT NOT NULL REFERENCES customer_invoice_edits(id),
    snapshot_side VARCHAR(7) NOT NULL CHECK (snapshot_side IN ('BEFORE', 'AFTER')),
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
    UNIQUE (edit_id, snapshot_side, line_number)
);
