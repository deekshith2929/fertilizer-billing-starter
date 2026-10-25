package com.example.fertilizer.customerledger.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;
import java.time.LocalDate;

public record CustomerLedgerEntryRequest(
        @NotBlank @Pattern(regexp = "OPENING|PAYMENT|ADJUSTMENT") String entryType,
        @NotNull LocalDate entryDate,
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal amount,
        @Pattern(regexp = "RECEIVABLE|ADVANCE|INCREASE_DUE|DECREASE_DUE",
                message = "Choose a valid opening balance or adjustment direction")
        String balanceSide,
        @Size(max = 100) String reference,
        @Size(max = 1000) String notes) {}
