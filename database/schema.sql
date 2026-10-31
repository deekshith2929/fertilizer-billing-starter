CREATE TABLE dealers(id BIGSERIAL PRIMARY KEY,dealer_code VARCHAR(40) UNIQUE NOT NULL,legal_name VARCHAR(200) NOT NULL,display_name VARCHAR(200) NOT NULL,address_line1 VARCHAR(200) NOT NULL,address_line2 VARCHAR(200),city VARCHAR(100) NOT NULL,state_name VARCHAR(100) NOT NULL,state_code VARCHAR(2) NOT NULL,pincode VARCHAR(10),gstin VARCHAR(15),phone VARCHAR(20),agl_no VARCHAR(100),pl_no VARCHAR(100),active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE app_users(id BIGSERIAL PRIMARY KEY,username VARCHAR(80) UNIQUE NOT NULL,password_hash VARCHAR(255) NOT NULL,full_name VARCHAR(200) NOT NULL,dealer_id BIGINT REFERENCES dealers(id),active BOOLEAN NOT NULL DEFAULT TRUE);
CREATE TABLE roles(id BIGSERIAL PRIMARY KEY,role_code VARCHAR(40) UNIQUE NOT NULL,display_name VARCHAR(100) NOT NULL);
CREATE TABLE permissions(id BIGSERIAL PRIMARY KEY,permission_code VARCHAR(80) UNIQUE NOT NULL,description VARCHAR(200) NOT NULL);
CREATE TABLE user_roles(user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,PRIMARY KEY(user_id,role_id));
CREATE TABLE role_permissions(role_id BIGINT REFERENCES roles(id) ON DELETE CASCADE,permission_id BIGINT REFERENCES permissions(id) ON DELETE CASCADE,PRIMARY KEY(role_id,permission_id));
CREATE TABLE products(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL REFERENCES dealers(id),product_code VARCHAR(60) NOT NULL,product_name VARCHAR(200) NOT NULL,brand VARCHAR(120),hsn_code VARCHAR(20) NOT NULL,category VARCHAR(40),bag_size_kg NUMERIC(12,3) NOT NULL CHECK(bag_size_kg>0),gst_rate NUMERIC(5,2) NOT NULL CHECK(gst_rate BETWEEN 0 AND 100),active BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE(dealer_id,product_code),UNIQUE(dealer_id,id));
CREATE TABLE dealer_product_prices(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL REFERENCES dealers(id),product_id BIGINT NOT NULL REFERENCES products(id),default_price_incl_gst NUMERIC(14,2) NOT NULL CHECK(default_price_incl_gst>=0),active BOOLEAN NOT NULL DEFAULT TRUE,UNIQUE(dealer_id,product_id),FOREIGN KEY(dealer_id,product_id) REFERENCES products(dealer_id,id));
CREATE INDEX idx_price_dealer ON dealer_product_prices(dealer_id,active);
CREATE TABLE suppliers(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL REFERENCES dealers(id),supplier_name VARCHAR(200) NOT NULL,supplier_code VARCHAR(60),contact_name VARCHAR(200),phone VARCHAR(30),email VARCHAR(200),address TEXT,active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dealer_id,id));
CREATE UNIQUE INDEX uq_suppliers_dealer_name ON suppliers(dealer_id,LOWER(supplier_name));
CREATE TABLE supplier_ledger_entries(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL,supplier_id BIGINT NOT NULL,entry_type VARCHAR(20) NOT NULL CHECK(entry_type IN ('OPENING','PURCHASE','PAYMENT')),entry_date DATE NOT NULL,reference VARCHAR(100),notes VARCHAR(1000),debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(debit_amount>=0),credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(credit_amount>=0),created_by BIGINT NOT NULL REFERENCES app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK((debit_amount>0 AND credit_amount=0) OR (credit_amount>0 AND debit_amount=0)),FOREIGN KEY(dealer_id,supplier_id) REFERENCES suppliers(dealer_id,id));
CREATE UNIQUE INDEX uq_supplier_opening_entry ON supplier_ledger_entries(dealer_id,supplier_id) WHERE entry_type='OPENING';
CREATE UNIQUE INDEX uq_supplier_purchase_reference ON supplier_ledger_entries(dealer_id,supplier_id,LOWER(reference)) WHERE entry_type='PURCHASE' AND reference IS NOT NULL;
CREATE INDEX idx_supplier_ledger_date ON supplier_ledger_entries(dealer_id,supplier_id,entry_date,id);
CREATE TABLE supplier_ledger_entry_edits(id BIGSERIAL PRIMARY KEY,ledger_entry_id BIGINT NOT NULL REFERENCES supplier_ledger_entries(id),changed_by BIGINT NOT NULL REFERENCES app_users(id),changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,previous_entry_type VARCHAR(20) NOT NULL,previous_entry_date DATE NOT NULL,previous_reference VARCHAR(100),previous_notes VARCHAR(1000),previous_debit_amount NUMERIC(14,2) NOT NULL,previous_credit_amount NUMERIC(14,2) NOT NULL,updated_entry_type VARCHAR(20) NOT NULL,updated_entry_date DATE NOT NULL,updated_reference VARCHAR(100),updated_notes VARCHAR(1000),updated_debit_amount NUMERIC(14,2) NOT NULL,updated_credit_amount NUMERIC(14,2) NOT NULL);
CREATE INDEX idx_supplier_ledger_entry_edits ON supplier_ledger_entry_edits(ledger_entry_id,changed_at DESC,id DESC);
CREATE SEQUENCE customer_invoice_number_seq START WITH 1 INCREMENT BY 1;
CREATE TABLE customers(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL REFERENCES dealers(id),customer_name VARCHAR(200) NOT NULL,phone VARCHAR(30),email VARCHAR(200),address VARCHAR(2000),gstin VARCHAR(15),state_code VARCHAR(2),active BOOLEAN NOT NULL DEFAULT TRUE,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dealer_id,id));
CREATE UNIQUE INDEX uq_customers_dealer_name ON customers(dealer_id,LOWER(customer_name));
CREATE TABLE customer_invoices(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL,customer_id BIGINT NOT NULL,invoice_number VARCHAR(40) NOT NULL,invoice_date DATE NOT NULL,customer_name VARCHAR(200) NOT NULL,customer_phone VARCHAR(30),customer_address VARCHAR(2000),customer_gstin VARCHAR(15),dealer_name VARCHAR(200) NOT NULL,dealer_address_line1 VARCHAR(200) NOT NULL,dealer_address_line2 VARCHAR(200),dealer_city VARCHAR(100) NOT NULL,dealer_state_name VARCHAR(100) NOT NULL,dealer_pincode VARCHAR(10),dealer_gstin VARCHAR(15),bill_type VARCHAR(10) NOT NULL CHECK(bill_type IN ('CASH','CREDIT')),destination_state_code VARCHAR(2) NOT NULL,tax_type VARCHAR(10) NOT NULL CHECK(tax_type IN ('IGST','CGST_SGST')),taxable_total NUMERIC(14,2) NOT NULL CHECK(taxable_total>=0),cgst_total NUMERIC(14,2) NOT NULL CHECK(cgst_total>=0),sgst_total NUMERIC(14,2) NOT NULL CHECK(sgst_total>=0),igst_total NUMERIC(14,2) NOT NULL CHECK(igst_total>=0),grand_total NUMERIC(14,2) NOT NULL CHECK(grand_total>0),created_by BIGINT NOT NULL REFERENCES app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(dealer_id,invoice_number),UNIQUE(dealer_id,id),FOREIGN KEY(dealer_id,customer_id) REFERENCES customers(dealer_id,id));
CREATE INDEX idx_customer_invoices ON customer_invoices(dealer_id,customer_id,invoice_date DESC,id DESC);
CREATE TABLE customer_invoice_items(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL,invoice_id BIGINT NOT NULL,line_number INTEGER NOT NULL CHECK(line_number>0),product_id BIGINT,product_name VARCHAR(200) NOT NULL,hsn_code VARCHAR(20) NOT NULL,bag_size_kg NUMERIC(12,3) NOT NULL CHECK(bag_size_kg>0),bags INTEGER NOT NULL CHECK(bags>0),quantity_kg NUMERIC(14,3) NOT NULL CHECK(quantity_kg>0),rate_incl_gst NUMERIC(14,2) NOT NULL CHECK(rate_incl_gst>0),gst_rate NUMERIC(5,2) NOT NULL CHECK(gst_rate BETWEEN 0 AND 100),taxable_amount NUMERIC(14,2) NOT NULL CHECK(taxable_amount>=0),cgst_amount NUMERIC(14,2) NOT NULL CHECK(cgst_amount>=0),sgst_amount NUMERIC(14,2) NOT NULL CHECK(sgst_amount>=0),igst_amount NUMERIC(14,2) NOT NULL CHECK(igst_amount>=0),line_total NUMERIC(14,2) NOT NULL CHECK(line_total>0),UNIQUE(invoice_id,line_number),FOREIGN KEY(dealer_id,invoice_id) REFERENCES customer_invoices(dealer_id,id),FOREIGN KEY(dealer_id,product_id) REFERENCES products(dealer_id,id));
CREATE TABLE customer_ledger_entries(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL,customer_id BIGINT NOT NULL,invoice_id BIGINT,entry_type VARCHAR(20) NOT NULL CHECK(entry_type IN ('OPENING','BILL','PAYMENT','ADJUSTMENT')),entry_date DATE NOT NULL,reference VARCHAR(100),notes VARCHAR(1000),debit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(debit_amount>=0),credit_amount NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK(credit_amount>=0),created_by BIGINT NOT NULL REFERENCES app_users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,CHECK((debit_amount>0 AND credit_amount=0) OR (credit_amount>0 AND debit_amount=0)),FOREIGN KEY(dealer_id,customer_id) REFERENCES customers(dealer_id,id),FOREIGN KEY(dealer_id,invoice_id) REFERENCES customer_invoices(dealer_id,id));
CREATE UNIQUE INDEX uq_customer_opening_entry ON customer_ledger_entries(dealer_id,customer_id) WHERE entry_type='OPENING';
CREATE UNIQUE INDEX uq_customer_invoice_bill_entry ON customer_ledger_entries(dealer_id,invoice_id) WHERE entry_type='BILL';
CREATE INDEX idx_customer_ledger_date ON customer_ledger_entries(dealer_id,customer_id,entry_date,id);
CREATE TABLE customer_invoice_edits(id BIGSERIAL PRIMARY KEY,dealer_id BIGINT NOT NULL,customer_id BIGINT NOT NULL,invoice_id BIGINT NOT NULL,reason VARCHAR(1000) NOT NULL,previous_taxable_total NUMERIC(14,2) NOT NULL,previous_cgst_total NUMERIC(14,2) NOT NULL,previous_sgst_total NUMERIC(14,2) NOT NULL,previous_igst_total NUMERIC(14,2) NOT NULL,previous_grand_total NUMERIC(14,2) NOT NULL,updated_taxable_total NUMERIC(14,2) NOT NULL,updated_cgst_total NUMERIC(14,2) NOT NULL,updated_sgst_total NUMERIC(14,2) NOT NULL,updated_igst_total NUMERIC(14,2) NOT NULL,updated_grand_total NUMERIC(14,2) NOT NULL,edited_by BIGINT NOT NULL REFERENCES app_users(id),edited_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY(dealer_id,customer_id) REFERENCES customers(dealer_id,id),FOREIGN KEY(dealer_id,invoice_id) REFERENCES customer_invoices(dealer_id,id));
CREATE INDEX idx_customer_invoice_edits ON customer_invoice_edits(dealer_id,customer_id,invoice_id,edited_at DESC,id DESC);
CREATE TABLE customer_invoice_edit_items(id BIGSERIAL PRIMARY KEY,edit_id BIGINT NOT NULL REFERENCES customer_invoice_edits(id),snapshot_side VARCHAR(7) NOT NULL CHECK(snapshot_side IN ('BEFORE','AFTER')),line_number INTEGER NOT NULL CHECK(line_number>0),product_id BIGINT,product_name VARCHAR(200) NOT NULL,hsn_code VARCHAR(20) NOT NULL,bag_size_kg NUMERIC(12,3) NOT NULL CHECK(bag_size_kg>0),bags INTEGER NOT NULL CHECK(bags>0),quantity_kg NUMERIC(14,3) NOT NULL CHECK(quantity_kg>0),rate_incl_gst NUMERIC(14,2) NOT NULL CHECK(rate_incl_gst>0),gst_rate NUMERIC(5,2) NOT NULL CHECK(gst_rate BETWEEN 0 AND 100),taxable_amount NUMERIC(14,2) NOT NULL CHECK(taxable_amount>=0),cgst_amount NUMERIC(14,2) NOT NULL CHECK(cgst_amount>=0),sgst_amount NUMERIC(14,2) NOT NULL CHECK(sgst_amount>=0),igst_amount NUMERIC(14,2) NOT NULL CHECK(igst_amount>=0),line_total NUMERIC(14,2) NOT NULL CHECK(line_total>0),UNIQUE(edit_id,snapshot_side,line_number));
INSERT INTO roles(role_code,display_name) VALUES('ADMIN','Admin'),('DEALER','Dealer'),('EMPLOYEE','Employee') ON CONFLICT DO NOTHING;
INSERT INTO permissions(permission_code,description) VALUES('BILLING_USE','Use runtime billing calculator'),('PRODUCT_VIEW','View products'),('PRODUCT_MANAGE','Manage products'),('DEALER_PRICE_MANAGE','Manage dealer prices'),('USER_MANAGE','Manage users'),('DEALER_MANAGE','Manage dealers'),('STOCK_REPORT_VIEW','Stock report'),('COMPANY_LEDGER_VIEW','Company/dealer ledger'),('CUSTOMER_LEDGER_VIEW','Farmer/customer ledger'),('DEALER_PRICE_LIST_VIEW','View dealer price lists and price comparisons'),('DEALER_PRICE_LIST_MANAGE','Import and maintain dealer price lists') ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_code IN('DEALER_MANAGE','USER_MANAGE') WHERE r.role_code='ADMIN' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_code IN('BILLING_USE','PRODUCT_VIEW','PRODUCT_MANAGE','DEALER_PRICE_MANAGE','STOCK_REPORT_VIEW','COMPANY_LEDGER_VIEW','CUSTOMER_LEDGER_VIEW','USER_MANAGE') WHERE r.role_code='DEALER' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_code IN('DEALER_PRICE_LIST_VIEW','DEALER_PRICE_LIST_MANAGE') WHERE r.role_code='DEALER' ON CONFLICT DO NOTHING;
INSERT INTO role_permissions(role_id,permission_id) SELECT r.id,p.id FROM roles r JOIN permissions p ON p.permission_code IN('BILLING_USE','PRODUCT_VIEW','PRODUCT_MANAGE','DEALER_PRICE_MANAGE','STOCK_REPORT_VIEW','COMPANY_LEDGER_VIEW','CUSTOMER_LEDGER_VIEW') WHERE r.role_code='EMPLOYEE' ON CONFLICT DO NOTHING;
INSERT INTO dealers(dealer_code,legal_name,display_name,address_line1,city,state_name,state_code,pincode,gstin) VALUES('DEMO-001','Nataraja Fertilizers','NATARAJA FERTILIZERS','Main Road','Nandyal','Andhra Pradesh','37','518501','37ABCDE1234F1Z5') ON CONFLICT DO NOTHING;
INSERT INTO app_users(username,password_hash,full_name,dealer_id) VALUES('admin','pbkdf2_sha256$310000$j2obScJOc6BdmyDINtFy7w==$GT0Cj/wmpgcvW2OLDuZoi+vQq6FMZtK1jnBwO27Azvo=','Demo Admin',NULL) ON CONFLICT(username) DO NOTHING;
INSERT INTO user_roles(user_id,role_id) SELECT u.id,r.id FROM app_users u CROSS JOIN roles r WHERE u.username='admin' AND r.role_code='ADMIN' ON CONFLICT(user_id,role_id) DO NOTHING;
INSERT INTO products(dealer_id,product_code,product_name,brand,hsn_code,category,bag_size_kg,gst_rate) SELECT d.id,v.code,v.name,'Demo Brand',v.hsn,'Fertilizer',v.bag_size,v.gst FROM dealers d CROSS JOIN (VALUES('DAP-50','DAP 50KG','31053000',50::NUMERIC,5::NUMERIC),('UREA-45','UREA 45KG','31021000',45::NUMERIC,5::NUMERIC),('MOP-50','MOP 50KG','31042000',50::NUMERIC,5::NUMERIC)) v(code,name,hsn,bag_size,gst) WHERE d.dealer_code='DEMO-001' ON CONFLICT(dealer_id,product_code) DO NOTHING;
INSERT INTO dealer_product_prices(dealer_id,product_id,default_price_incl_gst) SELECT d.id,p.id,v.price FROM dealers d CROSS JOIN (VALUES('DAP-50',1245.00::NUMERIC),('UREA-45',266.00::NUMERIC),('MOP-50',1700.00::NUMERIC)) v(code,price) JOIN products p ON p.dealer_id=d.id AND p.product_code=v.code WHERE d.dealer_code='DEMO-001' ON CONFLICT(dealer_id,product_id) DO NOTHING;
CREATE TABLE dealer_price_list_companies (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL REFERENCES dealers(id),
    company_name VARCHAR(200) NOT NULL,
    normalized_name VARCHAR(200) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (dealer_id, normalized_name),
    UNIQUE (dealer_id, id)
);
CREATE TABLE dealer_price_lists (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL REFERENCES dealers(id),
    company_id BIGINT NOT NULL,
    effective_date DATE,
    effective_period_text VARCHAR(100),
    source_type VARCHAR(20) NOT NULL CHECK (source_type IN ('UPLOAD', 'MANUAL_EDIT')),
    source_file_name VARCHAR(255),
    source_file_sha256 CHAR(64),
    status VARCHAR(20) NOT NULL CHECK (status IN ('REVIEW', 'CONFIRMED', 'CANCELLED')),
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    uploaded_by_user_id BIGINT NOT NULL REFERENCES app_users(id),
    confirmed_at TIMESTAMPTZ,
    confirmed_by_user_id BIGINT REFERENCES app_users(id),
    UNIQUE (dealer_id, id),
    UNIQUE (dealer_id, id, company_id),
    UNIQUE (dealer_id, source_file_sha256),
    FOREIGN KEY (dealer_id, company_id)
        REFERENCES dealer_price_list_companies(dealer_id, id)
);
CREATE TABLE dealer_price_list_items (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    price_list_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    trade_name VARCHAR(250),
    normalized_trade_name VARCHAR(250) NOT NULL DEFAULT '',
    technical_name VARCHAR(500),
    normalized_technical_name VARCHAR(500) NOT NULL DEFAULT '',
    unit_size NUMERIC(14,4) NOT NULL CHECK (unit_size >= 0),
    unit VARCHAR(24) NOT NULL,
    match_unit_size NUMERIC(18,7) NOT NULL CHECK (match_unit_size >= 0),
    match_unit VARCHAR(24) NOT NULL,
    price_ex_gst_per_unit NUMERIC(14,2),
    gst_percent NUMERIC(5,2),
    price_incl_gst_per_unit NUMERIC(14,2),
    mrp_per_unit NUMERIC(14,2),
    category VARCHAR(100),
    comments TEXT,
    source_reference VARCHAR(50),
    review_status VARCHAR(20) NOT NULL DEFAULT 'READY'
        CHECK (review_status IN ('READY', 'NEEDS_REVIEW', 'EXCLUDED')),
    review_notes TEXT,
    is_current BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (price_ex_gst_per_unit IS NULL OR price_ex_gst_per_unit >= 0
        OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    CHECK (price_incl_gst_per_unit IS NULL OR price_incl_gst_per_unit >= 0
        OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    CHECK (mrp_per_unit IS NULL OR mrp_per_unit >= 0
        OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    CHECK (gst_percent IS NULL OR gst_percent BETWEEN 0 AND 100
        OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    UNIQUE (dealer_id, id),
    FOREIGN KEY (dealer_id, price_list_id, company_id)
        REFERENCES dealer_price_lists(dealer_id, id, company_id)
);
CREATE TABLE dealer_price_list_item_audit (
    id BIGSERIAL PRIMARY KEY,
    dealer_id BIGINT NOT NULL,
    price_list_id BIGINT NOT NULL,
    previous_item_id BIGINT,
    new_item_id BIGINT NOT NULL,
    event_type VARCHAR(24) NOT NULL
        CHECK (event_type IN (
            'ADDED', 'PRICE_CHANGED', 'DETAILS_CHANGED', 'UNCHANGED',
            'HISTORICAL_IMPORT', 'MANUAL_EDIT'
        )),
    changed_fields JSONB NOT NULL DEFAULT '{}'::JSONB,
    reason TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    recorded_by_user_id BIGINT NOT NULL REFERENCES app_users(id),
    FOREIGN KEY (dealer_id, price_list_id)
        REFERENCES dealer_price_lists(dealer_id, id),
    FOREIGN KEY (dealer_id, previous_item_id)
        REFERENCES dealer_price_list_items(dealer_id, id),
    FOREIGN KEY (dealer_id, new_item_id)
        REFERENCES dealer_price_list_items(dealer_id, id)
);
CREATE UNIQUE INDEX uq_dealer_price_list_current_item
    ON dealer_price_list_items (
        dealer_id,
        company_id,
        md5(normalized_technical_name || '|' || normalized_trade_name || '|'
            || match_unit_size::TEXT || '|' || match_unit)
    )
    WHERE is_current = TRUE;
CREATE INDEX idx_dealer_price_list_current_search
    ON dealer_price_list_items(dealer_id, company_id, is_current);
CREATE INDEX idx_dealer_price_list_history_match
    ON dealer_price_list_items (
        dealer_id,
        company_id,
        md5(normalized_technical_name || '|' || normalized_trade_name || '|'
            || match_unit_size::TEXT || '|' || match_unit)
    );
CREATE INDEX idx_dealer_price_list_audit_item
    ON dealer_price_list_item_audit(dealer_id, new_item_id, recorded_at DESC);
CREATE INDEX idx_dealer_price_list_imports
    ON dealer_price_lists(dealer_id, status, uploaded_at DESC);
CREATE TABLE location_captures (
    id BIGSERIAL PRIMARY KEY,
    latitude NUMERIC(10, 7) NOT NULL,
    longitude NUMERIC(10, 7) NOT NULL,
    accuracy_meters NUMERIC(12, 3) NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    comments TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (latitude BETWEEN -90 AND 90),
    CHECK (longitude BETWEEN -180 AND 180),
    CHECK (accuracy_meters >= 0)
);
