package com.example.fertilizer.companyledger.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record SupplierLedgerEntryRequest(
        @NotBlank @Pattern(regexp = "OPENING|PURCHASE|PAYMENT") String entryType,
        @NotNull LocalDate entryDate,
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
        @Pattern(regexp = "PAYABLE|ADVANCE", message = "Opening balance side must be PAYABLE or ADVANCE")
        String openingBalanceSide,
        @Size(max = 100) String reference,
        @Size(max = 1000) String notes) {}
