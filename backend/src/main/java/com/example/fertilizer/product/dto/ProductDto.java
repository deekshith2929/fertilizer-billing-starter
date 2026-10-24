package com.example.fertilizer.product.dto;
import java.math.BigDecimal;
public record ProductDto(Long id, String productName, String hsnCode, BigDecimal bagSizeKg,
                         BigDecimal gstRate, BigDecimal defaultPriceInclGst) {}
