package com.example.fertilizer.customerledger.dto;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

public record CustomerInvoiceEditDto(
        Long id,
        String reason,
        OffsetDateTime editedAt,
        String editedBy,
        BigDecimal previousTaxableTotal,
        BigDecimal previousCgstTotal,
        BigDecimal previousSgstTotal,
        BigDecimal previousIgstTotal,
        BigDecimal previousGrandTotal,
        BigDecimal updatedTaxableTotal,
        BigDecimal updatedCgstTotal,
        BigDecimal updatedSgstTotal,
        BigDecimal updatedIgstTotal,
        BigDecimal updatedGrandTotal,
        List<CustomerInvoiceItemDto> previousItems,
        List<CustomerInvoiceItemDto> updatedItems) {}
