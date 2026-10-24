package com.example.fertilizer.product.repository;

import com.example.fertilizer.product.dto.ProductCreateRequest;
import com.example.fertilizer.product.dto.ProductDto;
import com.example.fertilizer.product.dto.ProductManagementDto;
import com.example.fertilizer.product.dto.ProductPriceUpdateRequest;
import com.example.fertilizer.product.dto.ProductUpdateRequest;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class ProductRepository {
    private static final Logger log = LoggerFactory.getLogger(ProductRepository.class);
    private final JdbcTemplate jdbc;

    public ProductRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<ProductDto> findActiveProducts(long dealerId) {
        try {
            return jdbc.query("""
                    SELECT p.id, p.product_name, p.hsn_code, p.bag_size_kg, p.gst_rate,
                           dp.default_price_incl_gst
                    FROM products p
                    JOIN dealer_product_prices dp ON dp.product_id = p.id
                    WHERE p.dealer_id = ? AND dp.dealer_id = ?
                      AND p.active = TRUE AND dp.active = TRUE
                    ORDER BY p.product_name
                    """, (rs, row) -> new ProductDto(
                    rs.getLong("id"), rs.getString("product_name"), rs.getString("hsn_code"),
                    rs.getBigDecimal("bag_size_kg"), rs.getBigDecimal("gst_rate"),
                    rs.getBigDecimal("default_price_incl_gst")), dealerId, dealerId);
        } catch (RuntimeException ex) {
            log.error("Unable to retrieve active products for dealerId={}", dealerId, ex);
            throw ex;
        }
    }

    public List<ProductManagementDto> findProductsForManagement(long dealerId) {
        return jdbc.query("""
                SELECT p.id, p.dealer_id, p.product_code, p.product_name, p.brand,
                       p.hsn_code, p.category, p.bag_size_kg, p.gst_rate,
                       dp.default_price_incl_gst, p.active
                FROM products p
                LEFT JOIN dealer_product_prices dp
                  ON dp.product_id = p.id AND dp.dealer_id = p.dealer_id
                WHERE p.dealer_id = ?
                ORDER BY p.active DESC, p.product_name
                """, (rs, row) -> new ProductManagementDto(
                rs.getLong("id"), rs.getLong("dealer_id"), rs.getString("product_code"),
                rs.getString("product_name"), rs.getString("brand"), rs.getString("hsn_code"),
                rs.getString("category"), rs.getBigDecimal("bag_size_kg"), rs.getBigDecimal("gst_rate"),
                rs.getBigDecimal("default_price_incl_gst"), rs.getBoolean("active")), dealerId);
    }

    public long createProduct(ProductCreateRequest request) {
        Long productId = jdbc.queryForObject("""
                INSERT INTO products
                    (dealer_id, product_code, product_name, brand, hsn_code, category, bag_size_kg, gst_rate)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, request.dealerId(), request.productCode().trim(),
                request.productName().trim(), blankToNull(request.brand()), request.hsnCode().trim(),
                blankToNull(request.category()), request.bagSizeKg(), request.gstRate());
        jdbc.update("""
                INSERT INTO dealer_product_prices (dealer_id, product_id, default_price_incl_gst)
                VALUES (?, ?, ?)
                """, request.dealerId(), productId, request.defaultPriceInclGst());
        return productId;
    }

    public boolean updateProduct(long dealerId, long productId, ProductUpdateRequest request) {
        int updated = jdbc.update("""
                UPDATE products
                SET product_code = ?, product_name = ?, brand = ?, hsn_code = ?,
                    category = ?, bag_size_kg = ?, gst_rate = ?
                WHERE id = ? AND dealer_id = ? AND active = TRUE
                """, request.productCode().trim(), request.productName().trim(), blankToNull(request.brand()),
                request.hsnCode().trim(), blankToNull(request.category()), request.bagSizeKg(),
                request.gstRate(), productId, dealerId);
        if (updated != 1) return false;
        return upsertProductPrice(dealerId, productId,
                new ProductPriceUpdateRequest(request.defaultPriceInclGst()));
    }

    public boolean upsertProductPrice(long dealerId, long productId, ProductPriceUpdateRequest request) {
        return jdbc.update("""
                INSERT INTO dealer_product_prices (dealer_id, product_id, default_price_incl_gst, active)
                SELECT ?, p.id, ?, TRUE
                FROM products p
                WHERE p.id = ? AND p.dealer_id = ? AND p.active = TRUE
                ON CONFLICT (dealer_id, product_id)
                DO UPDATE SET default_price_incl_gst = EXCLUDED.default_price_incl_gst, active = TRUE
                """, dealerId, request.defaultPriceInclGst(), productId, dealerId) == 1;
    }

    public boolean deactivateProduct(long dealerId, long productId) {
        int updated = jdbc.update("""
                UPDATE products
                SET active = FALSE
                WHERE id = ? AND dealer_id = ? AND active = TRUE
                """, productId, dealerId);
        if (updated == 1) {
            jdbc.update("""
                    UPDATE dealer_product_prices
                    SET active = FALSE
                    WHERE product_id = ? AND dealer_id = ?
                    """, productId, dealerId);
        }
        return updated == 1;
    }

    public boolean reactivateProduct(long dealerId, long productId) {
        int updated = jdbc.update("""
                UPDATE products
                SET active = TRUE
                WHERE id = ? AND dealer_id = ? AND active = FALSE
                """, productId, dealerId);
        if (updated == 1) {
            jdbc.update("""
                    UPDATE dealer_product_prices
                    SET active = TRUE
                    WHERE product_id = ? AND dealer_id = ?
                    """, productId, dealerId);
        }
        return updated == 1;
    }

    public boolean dealerExists(long dealerId) {
        Boolean exists = jdbc.queryForObject(
                "SELECT EXISTS (SELECT 1 FROM dealers WHERE id = ? AND active = TRUE)",
                Boolean.class, dealerId);
        return Boolean.TRUE.equals(exists);
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }
}
