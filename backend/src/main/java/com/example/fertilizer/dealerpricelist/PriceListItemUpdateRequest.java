package com.example.fertilizer.dealerpricelist;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import java.math.BigDecimal;

public record PriceListItemUpdateRequest(
        @Size(max = 250) String tradeName,
        @Size(max = 500) String technicalName,
        @NotNull @DecimalMin("0.0001") BigDecimal unitSize,
        @NotBlank @Size(max = 24) String unit,
        @DecimalMin("0.00") BigDecimal priceExGstPerUnit,
        @DecimalMin("0.00") @DecimalMax("100.00") BigDecimal gstPercent,
        @DecimalMin("0.00") BigDecimal priceInclGstPerUnit,
        @DecimalMin("0.00") BigDecimal mrpPerUnit,
        @Size(max = 100) String category,
        @Size(max = 4000) String comments,
        @Size(max = 50) String sourceReference,
        @NotBlank String reviewStatus,
        @Size(max = 1000) String reviewNotes,
        @Size(max = 1000) String reason) {
}
