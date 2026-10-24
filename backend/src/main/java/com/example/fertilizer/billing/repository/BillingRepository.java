package com.example.fertilizer.billing.repository;

import com.example.fertilizer.billing.dto.BillingResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.math.BigDecimal;

@Repository
public class BillingRepository {
    private static final Logger log = LoggerFactory.getLogger(BillingRepository.class);
    private final JdbcTemplate jdbc;
    public BillingRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    public BillingResponse.DealerDetails findActiveDealer(long dealerId) {
        try {
            return jdbc.queryForObject("""
                SELECT id, display_name, address_line1, address_line2, city, state_name, state_code, pincode, gstin
                FROM dealers WHERE id = ? AND active = TRUE
                """, (rs, row) -> new BillingResponse.DealerDetails(
                    rs.getLong("id"), rs.getString("display_name"), rs.getString("address_line1"),
                    rs.getString("address_line2"), rs.getString("city"), rs.getString("state_name"),
                    rs.getString("state_code"), rs.getString("pincode"), rs.getString("gstin")), dealerId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            log.warn("Active dealer not found: dealerId={}", dealerId);
            throw new IllegalArgumentException("Dealer was not found or is inactive.");
        }
    }

    public ProductPrice findPricedProduct(long dealerId, long productId) {
        try {
            return jdbc.queryForObject("""
                SELECT p.product_name, p.hsn_code, p.bag_size_kg, p.gst_rate, dp.default_price_incl_gst
                FROM products p JOIN dealer_product_prices dp ON dp.product_id = p.id
                WHERE p.id = ? AND p.dealer_id = ? AND dp.dealer_id = ?
                  AND p.active = TRUE AND dp.active = TRUE
                """, (rs, row) -> new ProductPrice(rs.getString("product_name"), rs.getString("hsn_code"),
                    rs.getBigDecimal("bag_size_kg"), rs.getBigDecimal("gst_rate"),
                    rs.getBigDecimal("default_price_incl_gst")), productId, dealerId, dealerId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            log.warn("Product not available for dealer: dealerId={}, productId={}", dealerId, productId);
            throw new IllegalArgumentException("Selected product is not active or has no price for this dealer.");
        }
    }

    public record ProductPrice(String productName, String hsnCode, BigDecimal bagSizeKg,
                               BigDecimal gstRate, BigDecimal defaultPriceInclGst) {}
}
