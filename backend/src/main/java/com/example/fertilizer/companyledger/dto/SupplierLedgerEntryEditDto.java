package com.example.fertilizer.companyledger.dto;

import java.time.OffsetDateTime;

public record SupplierLedgerEntryEditDto(
        Long id,
        OffsetDateTime changedAt,
        String changedBy,
        SupplierLedgerEntrySnapshotDto previousValues,
        SupplierLedgerEntrySnapshotDto updatedValues) {}
