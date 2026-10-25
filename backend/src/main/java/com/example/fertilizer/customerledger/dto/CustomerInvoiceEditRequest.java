package com.example.fertilizer.customerledger.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import java.util.List;

public record CustomerInvoiceEditRequest(
        @NotBlank @Size(max = 1000) String reason,
        @NotEmpty @Size(max = 100) List<@Valid CustomerInvoiceEditItemRequest> items) {}
