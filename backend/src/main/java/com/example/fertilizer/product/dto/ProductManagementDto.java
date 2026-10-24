package com.example.fertilizer.product.dto;

import java.math.BigDecimal;

public record ProductManagementDto(Long id, Long dealerId, String productCode, String productName,
                                   String brand, String hsnCode, String category, BigDecimal bagSizeKg,
                                   BigDecimal gstRate, BigDecimal defaultPriceInclGst,
                                   boolean active) {}
