package com.example.fertilizer.companyledger.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record SupplierCreateRequest(
        @NotBlank @Size(max = 200) String supplierName,
        @Size(max = 60) String supplierCode,
        @Size(max = 200) String contactName,
        @Size(max = 30) String phone,
        @Email @Size(max = 200) String email,
        @Size(max = 2000) String address) {}
