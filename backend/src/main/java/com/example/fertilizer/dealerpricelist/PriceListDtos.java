package com.example.fertilizer.dealerpricelist;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

public final class PriceListDtos {
    private PriceListDtos() {}

    public record CompanyDto(long id, String companyName) {}

    public record ImportDto(long id, String companyName, LocalDate effectiveDate,
                            String effectivePeriodText, String sourceFileName, String status,
                            OffsetDateTime uploadedAt, List<ItemDto> items) {}

    public record ItemDto(long id, String tradeName, String technicalName, BigDecimal unitSize,
                          String unit, BigDecimal priceExGstPerUnit, BigDecimal gstPercent,
                          BigDecimal priceInclGstPerUnit, BigDecimal mrpPerUnit, String category,
                          String comments, String sourceReference, String reviewStatus,
                          String reviewNotes, boolean current) {}

    public record PriceDto(long id, String companyName, LocalDate effectiveDate, String tradeName,
                           String technicalName, BigDecimal unitSize, String unit,
                           BigDecimal matchUnitSize, String matchUnit,
                           BigDecimal priceExGstPerUnit, BigDecimal gstPercent,
                           BigDecimal priceInclGstPerUnit, BigDecimal mrpPerUnit,
                           String category, String comments, String sourceReference) {}

    public record ItemCommentsDto(long itemId, String comments) {}

    public record AuditDto(long id, long priceListId, Long previousItemId, long newItemId,
                           String companyName, String tradeName, String technicalName,
                           BigDecimal unitSize, String unit, String eventType,
                           String changedFields, String reason,
                           OffsetDateTime recordedAt, String recordedBy) {}

    public record ImportSummaryDto(long id, String companyName, LocalDate effectiveDate,
                                  String effectivePeriodText, String sourceFileName, String status,
                                  OffsetDateTime uploadedAt, int itemCount, int needsReviewCount,
                                  int excludedCount) {}

    public record HistoryDto(long id, long priceListId, String companyName, LocalDate effectiveDate,
                             String sourceType, String sourceFileName, String tradeName,
                             String technicalName, BigDecimal unitSize, String unit,
                             BigDecimal priceExGstPerUnit, BigDecimal gstPercent,
                             BigDecimal priceInclGstPerUnit, BigDecimal mrpPerUnit,
                             boolean current, OffsetDateTime createdAt) {}
}
