ALTER TABLE products ADD COLUMN category VARCHAR(40);

UPDATE products
SET category = 'Fertilizer'
WHERE category IS NULL;
