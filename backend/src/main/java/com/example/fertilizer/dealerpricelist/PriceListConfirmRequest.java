package com.example.fertilizer.dealerpricelist;

import jakarta.validation.constraints.NotNull;

public record PriceListConfirmRequest(@NotNull Boolean makeCurrent) {
}
