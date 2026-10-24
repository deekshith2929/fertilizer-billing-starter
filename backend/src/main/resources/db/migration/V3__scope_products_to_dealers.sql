ALTER TABLE products ADD COLUMN dealer_id BIGINT REFERENCES dealers(id);

ALTER TABLE products DROP CONSTRAINT IF EXISTS products_product_code_key;

SELECT setval(pg_get_serial_sequence('products', 'id'),
              COALESCE((SELECT MAX(id) FROM products), 1),
              EXISTS (SELECT 1 FROM products));

CREATE TEMPORARY TABLE product_dealer_migration AS
SELECT p.id AS original_product_id,
       dp.dealer_id,
       ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY dp.dealer_id) AS dealer_number,
       CASE
           WHEN ROW_NUMBER() OVER (PARTITION BY p.id ORDER BY dp.dealer_id) = 1 THEN p.id
           ELSE nextval(pg_get_serial_sequence('products', 'id'))
       END AS dealer_product_id
FROM products p
JOIN dealer_product_prices dp ON dp.product_id = p.id;

UPDATE products p
SET dealer_id = migration.dealer_id
FROM product_dealer_migration migration
WHERE migration.original_product_id = p.id
  AND migration.dealer_number = 1;

INSERT INTO products (id, dealer_id, product_code, product_name, brand, hsn_code,
                      bag_size_kg, gst_rate, active)
SELECT migration.dealer_product_id, migration.dealer_id, p.product_code, p.product_name,
       p.brand, p.hsn_code, p.bag_size_kg, p.gst_rate, p.active
FROM product_dealer_migration migration
JOIN products p ON p.id = migration.original_product_id
WHERE migration.dealer_number > 1;

UPDATE dealer_product_prices dp
SET product_id = migration.dealer_product_id
FROM product_dealer_migration migration
WHERE dp.product_id = migration.original_product_id
  AND dp.dealer_id = migration.dealer_id;

ALTER TABLE products ADD CONSTRAINT uq_products_dealer_code UNIQUE (dealer_id, product_code);
ALTER TABLE products ADD CONSTRAINT uq_products_dealer_id_id UNIQUE (dealer_id, id);
ALTER TABLE dealer_product_prices
    ADD CONSTRAINT fk_dealer_product_price_owner
    FOREIGN KEY (dealer_id, product_id) REFERENCES products(dealer_id, id);
CREATE INDEX idx_products_dealer_active ON products(dealer_id, active);
