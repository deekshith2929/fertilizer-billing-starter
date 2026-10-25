package com.example.fertilizer.customerledger.dto;

import java.math.BigDecimal;

public record CustomerInvoiceItemDto(
        Integer lineNumber,
        Long productId,
        String productName,
        String hsnCode,
        BigDecimal bagSizeKg,
        Integer bags,
        BigDecimal quantityKg,
        BigDecimal rateInclGst,
        BigDecimal gstRate,
        BigDecimal taxableAmount,
        BigDecimal cgstAmount,
        BigDecimal sgstAmount,
        BigDecimal igstAmount,
        BigDecimal lineTotal) {}
