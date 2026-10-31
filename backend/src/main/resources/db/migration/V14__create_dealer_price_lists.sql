INSERT INTO permissions(permission_code, description)
VALUES
    ('DEALER_PRICE_LIST_VIEW', 'View dealer price lists and price comparisons'),
    ('DEALER_PRICE_LIST_MANAGE', 'Import and maintain dealer price lists')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions(role_id, permission_id)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.permission_code IN (
    'DEALER_PRICE_LIST_VIEW',
    'DEALER_PRICE_LIST_MANAGE'
)
WHERE r.role_code = 'DEALER'
ON CONFLICT DO NOTHING;

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
    match_unit_size NUMERIC(14,4) NOT NULL CHECK (match_unit_size >= 0),
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
        OR review_status = 'NEEDS_REVIEW'),
    CHECK (price_incl_gst_per_unit IS NULL OR price_incl_gst_per_unit >= 0
        OR review_status = 'NEEDS_REVIEW'),
    CHECK (mrp_per_unit IS NULL OR mrp_per_unit >= 0 OR review_status = 'NEEDS_REVIEW'),
    CHECK (gst_percent IS NULL OR gst_percent BETWEEN 0 AND 100
        OR review_status = 'NEEDS_REVIEW'),
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
