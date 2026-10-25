package com.example.fertilizer.customerledger.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record CustomerInvoiceEditItemRequest(
        Long productId,
        @NotBlank @Size(max = 200) String productName,
        @NotBlank @Size(max = 20) String hsnCode,
        @NotNull @DecimalMin("0.001") @Digits(integer = 9, fraction = 3) BigDecimal bagSizeKg,
        @NotNull @Min(1) Integer bags,
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal rateInclGst,
        @NotNull @DecimalMin("0.00") @Digits(integer = 3, fraction = 2) BigDecimal gstRate) {}
