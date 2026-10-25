package com.example.fertilizer.companyledger.dto;

import java.math.BigDecimal;

public record SupplierDto(
        Long id,
        String supplierName,
        String supplierCode,
        String contactName,
        String phone,
        String email,
        String address,
        boolean active,
        BigDecimal balance) {}
