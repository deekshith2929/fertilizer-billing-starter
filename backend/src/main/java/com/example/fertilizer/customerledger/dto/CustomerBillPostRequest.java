package com.example.fertilizer.customerledger.dto;

import com.example.fertilizer.billing.dto.BillingRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

public record CustomerBillPostRequest(
        @NotNull Long customerId,
        @NotNull @Valid BillingRequest bill) {}
