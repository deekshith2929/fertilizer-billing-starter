package com.example.fertilizer.billing.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record BillingResponse(
        DealerDetails dealer, String billType, String taxType, List<BillLine> items,
        BigDecimal taxableTotal, BigDecimal cgstTotal, BigDecimal sgstTotal,
        BigDecimal igstTotal, BigDecimal grandTotal, OffsetDateTime generatedAt) {
    public record DealerDetails(Long id, String displayName, String addressLine1, String addressLine2,
                                String city, String stateName, String stateCode, String pincode, String gstin) {}
    public record BillLine(String productName, String hsnCode, Integer bags, BigDecimal quantityKg,
                           BigDecimal rateInclGst, BigDecimal gstRate, BigDecimal taxableAmount,
                           BigDecimal cgst, BigDecimal sgst, BigDecimal igst, BigDecimal amountInclGst) {}
}
