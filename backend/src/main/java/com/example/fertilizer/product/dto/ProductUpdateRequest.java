package com.example.fertilizer.product.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record ProductUpdateRequest(
        @NotBlank @Size(max = 60) String productCode,
        @NotBlank @Size(max = 200) String productName,
        @Size(max = 120) String brand,
        @NotBlank @Size(max = 20) String hsnCode,
        @Size(max = 40) String category,
        @NotNull @DecimalMin("0.001") @Digits(integer = 9, fraction = 3) BigDecimal bagSizeKg,
        @NotNull @DecimalMin("0") @DecimalMax("100") @Digits(integer = 3, fraction = 2) BigDecimal gstRate,
        @NotNull @DecimalMin("0.01") @Digits(integer = 12, fraction = 2) BigDecimal defaultPriceInclGst) {}
