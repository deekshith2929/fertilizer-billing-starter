package com.example.fertilizer.customerledger.dto;

import java.math.BigDecimal;
import java.time.LocalDate;

public record CustomerLedgerEntryDto(
        Long id,
        String entryType,
        LocalDate entryDate,
        String reference,
        String notes,
        BigDecimal debitAmount,
        BigDecimal creditAmount,
        BigDecimal runningBalance,
        Long invoiceId,
        String invoiceNumber,
        String createdBy) {}
