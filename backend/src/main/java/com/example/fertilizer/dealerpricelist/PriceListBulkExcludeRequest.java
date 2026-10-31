package com.example.fertilizer.dealerpricelist;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;
import java.util.List;

public record PriceListBulkExcludeRequest(
        @NotEmpty @Size(max = 5000) List<@NotNull @Positive Long> itemIds) {
}
