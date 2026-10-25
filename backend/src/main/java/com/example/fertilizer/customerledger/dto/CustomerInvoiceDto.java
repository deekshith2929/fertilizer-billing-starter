package com.example.fertilizer.customerledger.dto;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public record CustomerInvoiceDto(
        Long id,
        String invoiceNumber,
        LocalDate invoiceDate,
        String customerName,
        String customerPhone,
        String customerAddress,
        String customerGstin,
        String dealerName,
        String dealerAddressLine1,
        String dealerAddressLine2,
        String dealerCity,
        String dealerStateName,
        String dealerPincode,
        String dealerGstin,
        String billType,
        String destinationStateCode,
        String taxType,
        BigDecimal taxableTotal,
        BigDecimal cgstTotal,
        BigDecimal sgstTotal,
        BigDecimal igstTotal,
        BigDecimal grandTotal,
        String createdBy,
        List<CustomerInvoiceItemDto> items) {}
