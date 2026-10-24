package com.example.fertilizer.product.repository;
import com.example.fertilizer.product.dto.ProductDto;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import java.util.List;
@Repository
public class ProductRepository {
    private static final Logger log = LoggerFactory.getLogger(ProductRepository.class);
    private final JdbcTemplate jdbc;
    public ProductRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public List<ProductDto> findActiveProducts(long dealerId) {
        try {
            return jdbc.query("""SELECT p.id, p.product_name, p.hsn_code, p.bag_size_kg, p.gst_rate, dp.default_price_incl_gst
                FROM products p JOIN dealer_product_prices dp ON dp.product_id=p.id
                WHERE dp.dealer_id=? AND p.active=TRUE AND dp.active=TRUE ORDER BY p.product_name""",
                (rs, row) -> new ProductDto(rs.getLong("id"), rs.getString("product_name"), rs.getString("hsn_code"),
                    rs.getBigDecimal("bag_size_kg"), rs.getBigDecimal("gst_rate"), rs.getBigDecimal("default_price_incl_gst")), dealerId);
        } catch (RuntimeException ex) {
            log.error("Unable to retrieve active products for dealerId={}", dealerId, ex);
            throw ex;
        }
    }
}
