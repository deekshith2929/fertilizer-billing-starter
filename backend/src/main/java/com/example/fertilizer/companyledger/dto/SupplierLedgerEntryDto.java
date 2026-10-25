package com.example.fertilizer.companyledger.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record SupplierLedgerEntryDto(
        Long id,
        String entryType,
        LocalDate entryDate,
        String reference,
        String notes,
        BigDecimal debitAmount,
        BigDecimal creditAmount,
        BigDecimal runningBalance,
        String createdBy) {}
