package com.example.fertilizer.customerledger.dto;

import java.math.BigDecimal;

public record CustomerDto(
        Long id,
        String customerName,
        String phone,
        String email,
        String address,
        String gstin,
        String stateCode,
        BigDecimal balance) {}
