package com.example.fertilizer.billing;

import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;

import java.math.*;
import java.util.*;

@RestController
@RequestMapping("/api/billing")
@CrossOrigin(origins = "http://localhost:5173")
public class BillingController {
    private final JdbcTemplate db;

    public BillingController(JdbcTemplate db) {
        this.db = db;
    }

    public record Item(@NotNull Long productId, @NotNull @DecimalMin("0.01") BigDecimal priceInclGst,
                       @NotNull @Min(1) Integer bags) {
    }

    public record Request(@NotNull Long dealerId, @NotEmpty List<@Valid Item> items, String billType,
                          String destinationStateCode) {
    }

    @PostMapping("/calculate")
    public Map<String, Object> calculate(@Valid @RequestBody Request q) {
       Long delrId=q.dealerId();
        delrId= 2L;
        Map<String, Object> d = db.queryForMap("SELECT display_name,address_line1,address_line2,city,state_name,state_code,gstin,pincode FROM dealers WHERE id=? AND active=true",delrId);
        String dest = q.destinationStateCode() == null || q.destinationStateCode().isBlank() ? String.valueOf(d.get("state_code")) : q.destinationStateCode().trim();
        boolean inter = !dest.equals(String.valueOf(d.get("state_code")));
        List<Map<String, Object>> lines = new ArrayList<>();
        BigDecimal taxableTotal = BigDecimal.ZERO, taxTotal = BigDecimal.ZERO, grossTotal = BigDecimal.ZERO;
        for (Item i : q.items()) {
            Map<String, Object> p = db.queryForMap("SELECT p.product_name,p.hsn_code,p.bag_size_kg,p.gst_rate FROM products p JOIN dealer_product_prices dp ON dp.product_id=p.id WHERE p.id=? AND dp.dealer_id=? AND p.active=true AND dp.active=true", i.productId(),delrId);
            BigDecimal size = (BigDecimal) p.get("bag_size_kg"), rate = (BigDecimal) p.get("gst_rate"), gross = i.priceInclGst().multiply(BigDecimal.valueOf(i.bags())).setScale(2, RoundingMode.HALF_UP), taxable = gross.multiply(new BigDecimal("100")).divide(new BigDecimal("100").add(rate), 2, RoundingMode.HALF_UP), tax = gross.subtract(taxable), cgst = inter ? BigDecimal.ZERO : tax.divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP), sgst = inter ? BigDecimal.ZERO : tax.subtract(cgst);
            Map<String, Object> l = new LinkedHashMap<>();
            l.put("productName", p.get("product_name"));
            l.put("hsnCode", p.get("hsn_code"));
            l.put("bags", i.bags());
            l.put("quantityKg", size.multiply(BigDecimal.valueOf(i.bags())));
            l.put("rateInclGst", i.priceInclGst());
            l.put("gstRate", rate);
            l.put("taxableAmount", taxable);
            l.put("cgst", cgst);
            l.put("sgst", sgst);
            l.put("igst", inter ? tax : BigDecimal.ZERO);
            l.put("amountInclGst", gross);
            lines.add(l);
            taxableTotal = taxableTotal.add(taxable);
            taxTotal = taxTotal.add(tax);
            grossTotal = grossTotal.add(gross);
        }
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("dealer", d);
        o.put("billType", "CREDIT".equalsIgnoreCase(q.billType()) ? "Credit Bill" : "Cash Bill");
        o.put("taxType", inter ? "IGST" : "CGST_SGST");
        o.put("items", lines);
        o.put("taxableTotal", taxableTotal);
        o.put("cgstTotal", inter ? BigDecimal.ZERO : taxTotal.divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP));
        o.put("sgstTotal", inter ? BigDecimal.ZERO : taxTotal.subtract(taxTotal.divide(new BigDecimal("2"), 2, RoundingMode.HALF_UP)));
        o.put("igstTotal", inter ? taxTotal : BigDecimal.ZERO);
        o.put("grandTotal", grossTotal);
        o.put("generatedAt", java.time.OffsetDateTime.now().toString());
        return o;
    }
}
