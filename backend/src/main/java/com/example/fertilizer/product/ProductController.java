package com.example.fertilizer.product;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "http://localhost:5173")
public class ProductController {
    private final JdbcTemplate jdbc;

    public ProductController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping
    public List<Map<String, Object>> list(@RequestParam(defaultValue = "2") long dealerId) {
        dealerId=2;
        return jdbc.query("SELECT p.id,p.product_name,p.hsn_code,p.bag_size_kg,p.gst_rate,dp.default_price_incl_gst FROM products p JOIN dealer_product_prices dp ON dp.product_id=p.id WHERE dp.dealer_id=? AND p.active=true AND dp.active=true ORDER BY p.product_name", (r, n) -> {
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("id", r.getLong("id"));
            m.put("productName", r.getString("product_name"));
            m.put("hsnCode", r.getString("hsn_code"));
            m.put("bagSizeKg", r.getBigDecimal("bag_size_kg"));
            m.put("gstRate", r.getBigDecimal("gst_rate"));
            m.put("defaultPriceInclGst", r.getBigDecimal("default_price_incl_gst"));
            return m;
        }, dealerId);
    }
}
