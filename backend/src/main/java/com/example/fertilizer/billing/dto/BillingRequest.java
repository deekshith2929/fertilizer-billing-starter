package com.example.fertilizer.billing.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

public record BillingRequest(
        @NotNull Long dealerId,
        @NotEmpty List<@Valid ItemRequest> items,
        String billType,
        String destinationStateCode) {
    public record ItemRequest(
            @NotNull Long productId,
            @NotNull @DecimalMin(value = "0.01", message = "Price must be greater than zero") BigDecimal priceInclGst,
            @NotNull @Min(value = 1, message = "At least one bag is required") Integer bags) {}
}
