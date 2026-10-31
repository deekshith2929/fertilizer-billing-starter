DROP INDEX IF EXISTS uq_dealer_price_list_current_item;
DROP INDEX IF EXISTS idx_dealer_price_list_history_match;

ALTER TABLE dealer_price_list_items
    DROP CONSTRAINT IF EXISTS dealer_price_list_items_check,
    DROP CONSTRAINT IF EXISTS dealer_price_list_items_check1,
    DROP CONSTRAINT IF EXISTS dealer_price_list_items_check2,
    DROP CONSTRAINT IF EXISTS dealer_price_list_items_check3;

ALTER TABLE dealer_price_list_items
    ALTER COLUMN match_unit_size TYPE NUMERIC(18,7)
        USING match_unit_size::NUMERIC(18,7);

ALTER TABLE dealer_price_list_items
    ADD CONSTRAINT dealer_price_list_items_price_ex_gst_check
        CHECK (price_ex_gst_per_unit IS NULL OR price_ex_gst_per_unit >= 0
            OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    ADD CONSTRAINT dealer_price_list_items_price_incl_gst_check
        CHECK (price_incl_gst_per_unit IS NULL OR price_incl_gst_per_unit >= 0
            OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    ADD CONSTRAINT dealer_price_list_items_mrp_check
        CHECK (mrp_per_unit IS NULL OR mrp_per_unit >= 0
            OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED')),
    ADD CONSTRAINT dealer_price_list_items_gst_check
        CHECK (gst_percent IS NULL OR gst_percent BETWEEN 0 AND 100
            OR review_status IN ('NEEDS_REVIEW', 'EXCLUDED'));

CREATE UNIQUE INDEX uq_dealer_price_list_current_item
    ON dealer_price_list_items (
        dealer_id,
        company_id,
        md5(normalized_technical_name || '|' || normalized_trade_name || '|'
            || match_unit_size::TEXT || '|' || match_unit)
    )
    WHERE is_current = TRUE;

CREATE INDEX idx_dealer_price_list_history_match
    ON dealer_price_list_items (
        dealer_id,
        company_id,
        md5(normalized_technical_name || '|' || normalized_trade_name || '|'
            || match_unit_size::TEXT || '|' || match_unit)
    );
