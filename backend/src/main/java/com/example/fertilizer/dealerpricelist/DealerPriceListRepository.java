package com.example.fertilizer.dealerpricelist;

import com.example.fertilizer.dealerpricelist.PriceListDtos.AuditDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.CompanyDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.HistoryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportSummaryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ItemDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.PriceDto;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Repository;

@Repository
public class DealerPriceListRepository {
    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;

    public DealerPriceListRepository(JdbcTemplate jdbc, ObjectMapper objectMapper) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
    }

    public boolean hasFileHash(long dealerId, String hash) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM dealer_price_lists
                    WHERE dealer_id = ? AND source_file_sha256 = ?
                )
                """, Boolean.class, dealerId, hash));
    }

    public CreatedImport createImport(long dealerId, long userId, String companyName, String normalizedCompany,
                                      LocalDate effectiveDate, String effectivePeriod, String sourceFileName,
                                      String fileHash) {
        long companyId = queryId("""
                INSERT INTO dealer_price_list_companies (dealer_id, company_name, normalized_name)
                VALUES (?, ?, ?)
                ON CONFLICT (dealer_id, normalized_name)
                DO UPDATE SET company_name = EXCLUDED.company_name
                RETURNING id
                """, dealerId, companyName, normalizedCompany);
        long importId = queryId("""
                INSERT INTO dealer_price_lists
                    (dealer_id, company_id, effective_date, effective_period_text, source_type,
                     source_file_name, source_file_sha256, status, uploaded_by_user_id)
                VALUES (?, ?, ?, ?, 'UPLOAD', ?, ?, 'REVIEW', ?)
                RETURNING id
                """, dealerId, companyId, effectiveDate == null ? null : Date.valueOf(effectiveDate),
                effectivePeriod, sourceFileName, fileHash, userId);
        return new CreatedImport(importId, companyId);
    }

    public long createManualEditList(long dealerId, long userId, long companyId,
                                     LocalDate effectiveDate, String effectivePeriod) {
        return queryId("""
                INSERT INTO dealer_price_lists
                    (dealer_id, company_id, effective_date, effective_period_text, source_type,
                     status, uploaded_by_user_id, confirmed_at, confirmed_by_user_id)
                VALUES (?, ?, ?, ?, 'MANUAL_EDIT', 'CONFIRMED', ?, CURRENT_TIMESTAMP, ?)
                RETURNING id
                """, dealerId, companyId, effectiveDate == null ? null : Date.valueOf(effectiveDate),
                effectivePeriod, userId, userId);
    }

    public long findOrCreateCompany(long dealerId, String companyName, String normalizedCompany) {
        return queryId("""
                INSERT INTO dealer_price_list_companies (dealer_id, company_name, normalized_name)
                VALUES (?, ?, ?)
                ON CONFLICT (dealer_id, normalized_name)
                DO UPDATE SET company_name = EXCLUDED.company_name
                RETURNING id
                """, dealerId, companyName, normalizedCompany);
    }

    public long insertItem(long dealerId, long listId, long companyId,
                           PriceListFileParser.ParsedItem item) {
        return queryId("""
                INSERT INTO dealer_price_list_items (
                    dealer_id, price_list_id, company_id, trade_name, normalized_trade_name,
                    technical_name, normalized_technical_name, unit_size, unit, match_unit_size,
                    match_unit, price_ex_gst_per_unit, gst_percent, price_incl_gst_per_unit,
                    mrp_per_unit, category, comments, source_reference, review_status, review_notes
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, dealerId, listId, companyId, item.tradeName(), item.normalizedTradeName(),
                item.technicalName(), item.normalizedTechnicalName(), item.unitSize(), item.unit(),
                item.matchUnitSize(), item.matchUnit(), item.priceExGstPerUnit(), item.gstPercent(),
                item.priceInclGstPerUnit(), item.mrpPerUnit(), item.category(), item.comments(),
                item.sourceReference(), item.reviewStatus(), item.reviewNotes());
    }

    public Optional<ImportDto> findImport(long dealerId, long importId) {
        List<ImportDto> imports = jdbc.query("""
                SELECT pl.id, c.company_name, pl.effective_date, pl.effective_period_text,
                       pl.source_file_name, pl.status, pl.uploaded_at
                FROM dealer_price_lists pl
                JOIN dealer_price_list_companies c
                  ON c.dealer_id = pl.dealer_id AND c.id = pl.company_id
                WHERE pl.dealer_id = ? AND pl.id = ?
                """, (rs, row) -> new ImportDto(rs.getLong("id"), rs.getString("company_name"),
                rs.getObject("effective_date", LocalDate.class), rs.getString("effective_period_text"),
                rs.getString("source_file_name"), rs.getString("status"),
                rs.getObject("uploaded_at", java.time.OffsetDateTime.class), List.of()), dealerId, importId);
        return imports.stream().findFirst().map(item -> new ImportDto(item.id(), item.companyName(),
                item.effectiveDate(), item.effectivePeriodText(), item.sourceFileName(), item.status(),
                item.uploadedAt(), findItems(dealerId, importId)));
    }

    public List<ItemDto> findItems(long dealerId, long importId) {
        return jdbc.query("""
                SELECT id, trade_name, technical_name, unit_size, unit, price_ex_gst_per_unit,
                       gst_percent, price_incl_gst_per_unit, mrp_per_unit, category, comments,
                       source_reference, review_status, review_notes, is_current
                FROM dealer_price_list_items
                WHERE dealer_id = ? AND price_list_id = ?
                ORDER BY source_reference, id
                """, itemRowMapper, dealerId, importId);
    }

    public List<ImportSummaryDto> findImports(long dealerId) {
        return jdbc.query("""
                SELECT pl.id, c.company_name, pl.effective_date, pl.effective_period_text,
                       pl.source_file_name, pl.status, pl.uploaded_at, COUNT(i.id) AS item_count,
                       COUNT(i.id) FILTER (WHERE i.review_status = 'NEEDS_REVIEW') AS needs_review_count,
                       COUNT(i.id) FILTER (WHERE i.review_status = 'EXCLUDED') AS excluded_count
                FROM dealer_price_lists pl
                JOIN dealer_price_list_companies c
                  ON c.dealer_id = pl.dealer_id AND c.id = pl.company_id
                LEFT JOIN dealer_price_list_items i
                  ON i.dealer_id = pl.dealer_id AND i.price_list_id = pl.id
                WHERE pl.dealer_id = ?
                GROUP BY pl.id, c.company_name
                ORDER BY pl.uploaded_at DESC, pl.id DESC
                LIMIT 100
                """, (rs, row) -> new ImportSummaryDto(rs.getLong("id"), rs.getString("company_name"),
                rs.getObject("effective_date", LocalDate.class), rs.getString("effective_period_text"),
                rs.getString("source_file_name"), rs.getString("status"),
                rs.getObject("uploaded_at", java.time.OffsetDateTime.class), rs.getInt("item_count"),
                rs.getInt("needs_review_count"), rs.getInt("excluded_count")), dealerId);
    }

    public void updateDraftItem(long dealerId, long importId, long itemId,
                                PriceListItemUpdateRequest request, String tradeNameNormalized,
                                String technicalNameNormalized, String unit, BigDecimal matchSize,
                                String matchUnit, String status, String reviewNotes) {
        int updated = jdbc.update("""
                UPDATE dealer_price_list_items i
                SET trade_name = ?, normalized_trade_name = ?,
                    technical_name = ?, normalized_technical_name = ?,
                    unit_size = ?, unit = ?, match_unit_size = ?, match_unit = ?,
                    price_ex_gst_per_unit = ?, gst_percent = ?, price_incl_gst_per_unit = ?,
                    mrp_per_unit = ?, category = ?, comments = ?, source_reference = ?,
                    review_status = ?, review_notes = ?
                FROM dealer_price_lists pl
                WHERE i.dealer_id = ? AND i.price_list_id = ? AND i.id = ?
                  AND pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                  AND pl.status = 'REVIEW'
                """, request.tradeName(), tradeNameNormalized, request.technicalName(),
                technicalNameNormalized, request.unitSize(), unit, matchSize, matchUnit,
                request.priceExGstPerUnit(), request.gstPercent(), request.priceInclGstPerUnit(),
                request.mrpPerUnit(), request.category(), request.comments(), request.sourceReference(),
                status, reviewNotes, dealerId, importId, itemId);
        if (updated != 1) throw new IllegalStateException("The draft price-list row was not updated.");
    }

    public int excludeDraftItems(long dealerId, long importId, List<Long> itemIds) {
        String placeholders = String.join(", ", java.util.Collections.nCopies(itemIds.size(), "?"));
        Object[] args = new Object[itemIds.size() + 2];
        args[0] = dealerId;
        args[1] = importId;
        for (int index = 0; index < itemIds.size(); index++) args[index + 2] = itemIds.get(index);
        return jdbc.update("""
                UPDATE dealer_price_list_items i
                SET review_status = 'EXCLUDED',
                    review_notes = CASE
                        WHEN i.review_notes IS NULL OR i.review_notes = '' THEN 'Excluded by dealer.'
                        ELSE i.review_notes || ' Excluded by dealer.'
                    END
                FROM dealer_price_lists pl
                WHERE i.dealer_id = ? AND i.price_list_id = ?
                  AND i.id IN (%s)
                  AND i.review_status <> 'EXCLUDED'
                  AND pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                  AND pl.status = 'REVIEW'
                """.formatted(placeholders), args);
    }

    public boolean importIsReview(long dealerId, long importId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM dealer_price_lists
                    WHERE dealer_id = ? AND id = ? AND status = 'REVIEW'
                )
                """, Boolean.class, dealerId, importId));
    }

    public boolean hasUnreviewedImportItems(long dealerId, long importId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM dealer_price_list_items
                    WHERE dealer_id = ? AND price_list_id = ? AND review_status = 'NEEDS_REVIEW'
                )
                """, Boolean.class, dealerId, importId));
    }

    public void cancelImport(long dealerId, long importId) {
        int updated = jdbc.update("""
                UPDATE dealer_price_lists
                SET status = 'CANCELLED'
                WHERE dealer_id = ? AND id = ? AND status = 'REVIEW'
                """, dealerId, importId);
        if (updated != 1) throw new IllegalStateException("The price-list import was not cancelled.");
    }

    public List<StoredItem> findReadyItems(long dealerId, long importId) {
        return jdbc.query("""
                SELECT i.*, pl.effective_date, pl.effective_period_text, pl.status AS list_status
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                WHERE i.dealer_id = ? AND i.price_list_id = ? AND i.review_status = 'READY'
                ORDER BY i.id
                """, storedItemRowMapper, dealerId, importId);
    }

    public void confirmImport(long dealerId, long importId, long userId) {
        int updated = jdbc.update("""
                UPDATE dealer_price_lists
                SET status = 'CONFIRMED', confirmed_at = CURRENT_TIMESTAMP, confirmed_by_user_id = ?
                WHERE dealer_id = ? AND id = ? AND status = 'REVIEW'
                """, userId, dealerId, importId);
        if (updated != 1) throw new IllegalStateException("The price-list import is no longer awaiting review.");
    }

    public Optional<StoredItem> findCurrentMatch(long dealerId, long companyId,
                                                 String technicalName, String tradeName,
                                                 BigDecimal matchSize, String matchUnit) {
        return jdbc.query("""
                SELECT i.*, pl.effective_date, pl.effective_period_text, pl.status AS list_status
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                WHERE i.dealer_id = ? AND i.company_id = ?
                  AND i.normalized_technical_name = ? AND i.normalized_trade_name = ?
                  AND i.match_unit_size = ? AND i.match_unit = ?
                  AND i.is_current = TRUE AND pl.status = 'CONFIRMED'
                """, storedItemRowMapper, dealerId, companyId, technicalName, tradeName,
                matchSize, matchUnit).stream().findFirst();
    }

    public Optional<StoredItem> findItem(long dealerId, long itemId) {
        return jdbc.query("""
                SELECT i.*, pl.effective_date, pl.effective_period_text, pl.status AS list_status
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                WHERE i.dealer_id = ? AND i.id = ?
                """, storedItemRowMapper, dealerId, itemId).stream().findFirst();
    }

    public void setCurrent(long dealerId, long itemId, boolean current) {
        jdbc.update("""
                UPDATE dealer_price_list_items SET is_current = ?
                WHERE dealer_id = ? AND id = ?
                """, current, dealerId, itemId);
    }

    public void recordAudit(long dealerId, long listId, Long previousId, long newId,
                            String eventType, Map<String, Object> changedFields,
                            String reason, long userId) {
        try {
            jdbc.update("""
                    INSERT INTO dealer_price_list_item_audit (
                        dealer_id, price_list_id, previous_item_id, new_item_id,
                        event_type, changed_fields, reason, recorded_by_user_id
                    ) VALUES (?, ?, ?, ?, ?, ?::jsonb, ?, ?)
                    """, dealerId, listId, previousId, newId, eventType,
                    objectMapper.writeValueAsString(changedFields), reason, userId);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize price-list audit details.", ex);
        }
    }

    public List<PriceDto> searchCurrent(long dealerId, String normalizedSearch) {
        String pattern = "%" + normalizedSearch + "%";
        return jdbc.query("""
                SELECT i.id, c.company_name, pl.effective_date, i.trade_name, i.technical_name,
                       i.unit_size, i.unit, i.match_unit_size, i.match_unit,
                       i.price_ex_gst_per_unit, i.gst_percent,
                       i.price_incl_gst_per_unit, i.mrp_per_unit, i.category, i.comments,
                       i.source_reference
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl
                  ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                JOIN dealer_price_list_companies c
                  ON c.dealer_id = i.dealer_id AND c.id = i.company_id
                WHERE i.dealer_id = ? AND i.is_current = TRUE AND pl.status = 'CONFIRMED'
                  AND (i.normalized_trade_name LIKE ? OR i.normalized_technical_name LIKE ?)
                ORDER BY i.technical_name, i.trade_name, i.match_unit_size, c.company_name
                LIMIT 200
                """, priceRowMapper, dealerId, pattern, pattern);
    }

    public List<HistoryDto> findHistory(long dealerId, StoredItem item) {
        return jdbc.query("""
                WITH RECURSIVE linked_items(id) AS (
                    SELECT ?::BIGINT
                    UNION
                    SELECT CASE WHEN a.new_item_id = linked_items.id
                                THEN a.previous_item_id ELSE a.new_item_id END
                    FROM dealer_price_list_item_audit a
                    JOIN linked_items ON a.new_item_id = linked_items.id
                        OR a.previous_item_id = linked_items.id
                    WHERE a.dealer_id = ? AND a.previous_item_id IS NOT NULL
                )
                SELECT i.id, i.price_list_id, c.company_name, pl.effective_date, pl.source_type,
                       pl.source_file_name, i.trade_name, i.technical_name, i.unit_size, i.unit,
                       i.price_ex_gst_per_unit, i.gst_percent, i.price_incl_gst_per_unit,
                       i.mrp_per_unit, i.is_current, i.created_at
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl
                  ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                JOIN dealer_price_list_companies c
                  ON c.dealer_id = i.dealer_id AND c.id = i.company_id
                WHERE i.dealer_id = ? AND i.id IN (SELECT id FROM linked_items)
                  AND pl.status = 'CONFIRMED'
                ORDER BY pl.effective_date DESC NULLS LAST, i.created_at DESC
                """, historyRowMapper, item.id(), dealerId, dealerId);
    }

    public List<AuditDto> findAudit(long dealerId) {
        return jdbc.query("""
                SELECT a.id, a.price_list_id, a.previous_item_id, a.new_item_id,
                       c.company_name, i.trade_name, i.technical_name, i.unit_size, i.unit,
                       a.event_type, a.changed_fields::text AS changed_fields, a.reason,
                       a.recorded_at, u.full_name AS recorded_by
                FROM dealer_price_list_item_audit a
                JOIN app_users u ON u.id = a.recorded_by_user_id
                JOIN dealer_price_list_items i
                  ON i.dealer_id = a.dealer_id AND i.id = a.new_item_id
                JOIN dealer_price_list_companies c
                  ON c.dealer_id = i.dealer_id AND c.id = i.company_id
                WHERE a.dealer_id = ?
                ORDER BY a.recorded_at DESC, a.id DESC
                LIMIT 200
                """, (rs, row) -> new AuditDto(rs.getLong("id"), rs.getLong("price_list_id"),
                rs.getObject("previous_item_id", Long.class), rs.getLong("new_item_id"),
                rs.getString("company_name"), rs.getString("trade_name"),
                rs.getString("technical_name"), rs.getBigDecimal("unit_size"), rs.getString("unit"),
                rs.getString("event_type"), rs.getString("changed_fields"), rs.getString("reason"),
                rs.getObject("recorded_at", java.time.OffsetDateTime.class),
                rs.getString("recorded_by")), dealerId);
    }

    public List<CompanyDto> findCompanies(long dealerId) {
        return jdbc.query("""
                SELECT id, company_name FROM dealer_price_list_companies
                WHERE dealer_id = ?
                ORDER BY company_name
                """, (rs, row) -> new CompanyDto(rs.getLong("id"), rs.getString("company_name")),
                dealerId);
    }

    public List<String> findTechnicalNames(long dealerId) {
        return jdbc.query("""
                SELECT DISTINCT ON (i.normalized_technical_name) i.technical_name
                FROM dealer_price_list_items i
                JOIN dealer_price_lists pl
                  ON pl.dealer_id = i.dealer_id AND pl.id = i.price_list_id
                WHERE i.dealer_id = ? AND pl.status = 'CONFIRMED'
                  AND i.review_status = 'READY'
                  AND i.technical_name IS NOT NULL AND i.normalized_technical_name <> ''
                ORDER BY i.normalized_technical_name, i.created_at DESC, i.id DESC
                """, (rs, row) -> rs.getString("technical_name"), dealerId);
    }

    private long queryId(String sql, Object... args) {
        Long id = jdbc.queryForObject(sql, Long.class, args);
        if (id == null) throw new IllegalStateException("Database did not return a created record ID.");
        return id;
    }

    private final RowMapper<ItemDto> itemRowMapper = (rs, row) -> new ItemDto(
            rs.getLong("id"), rs.getString("trade_name"), rs.getString("technical_name"),
            rs.getBigDecimal("unit_size"), rs.getString("unit"),
            rs.getBigDecimal("price_ex_gst_per_unit"), rs.getBigDecimal("gst_percent"),
            rs.getBigDecimal("price_incl_gst_per_unit"), rs.getBigDecimal("mrp_per_unit"),
            rs.getString("category"), rs.getString("comments"), rs.getString("source_reference"),
            rs.getString("review_status"), rs.getString("review_notes"), rs.getBoolean("is_current"));

    private final RowMapper<StoredItem> storedItemRowMapper = (rs, row) -> new StoredItem(
            rs.getLong("id"), rs.getLong("dealer_id"), rs.getLong("price_list_id"),
            rs.getLong("company_id"), rs.getString("trade_name"), rs.getString("normalized_trade_name"),
            rs.getString("technical_name"), rs.getString("normalized_technical_name"),
            rs.getBigDecimal("unit_size"), rs.getString("unit"), rs.getBigDecimal("match_unit_size"),
            rs.getString("match_unit"), rs.getBigDecimal("price_ex_gst_per_unit"),
            rs.getBigDecimal("gst_percent"), rs.getBigDecimal("price_incl_gst_per_unit"),
            rs.getBigDecimal("mrp_per_unit"), rs.getString("category"), rs.getString("comments"),
            rs.getString("source_reference"), rs.getString("review_status"), rs.getString("review_notes"),
            rs.getBoolean("is_current"), rs.getObject("effective_date", LocalDate.class),
            rs.getString("effective_period_text"), rs.getString("list_status"));

    private final RowMapper<PriceDto> priceRowMapper = (rs, row) -> new PriceDto(
            rs.getLong("id"), rs.getString("company_name"),
            rs.getObject("effective_date", LocalDate.class), rs.getString("trade_name"),
            rs.getString("technical_name"), rs.getBigDecimal("unit_size"), rs.getString("unit"),
            rs.getBigDecimal("match_unit_size"), rs.getString("match_unit"),
            rs.getBigDecimal("price_ex_gst_per_unit"), rs.getBigDecimal("gst_percent"),
            rs.getBigDecimal("price_incl_gst_per_unit"), rs.getBigDecimal("mrp_per_unit"),
            rs.getString("category"), rs.getString("comments"), rs.getString("source_reference"));

    private final RowMapper<HistoryDto> historyRowMapper = (rs, row) -> new HistoryDto(
            rs.getLong("id"), rs.getLong("price_list_id"), rs.getString("company_name"),
            rs.getObject("effective_date", LocalDate.class), rs.getString("source_type"),
            rs.getString("source_file_name"), rs.getString("trade_name"),
            rs.getString("technical_name"), rs.getBigDecimal("unit_size"), rs.getString("unit"),
            rs.getBigDecimal("price_ex_gst_per_unit"), rs.getBigDecimal("gst_percent"),
            rs.getBigDecimal("price_incl_gst_per_unit"), rs.getBigDecimal("mrp_per_unit"),
            rs.getBoolean("is_current"), rs.getObject("created_at", java.time.OffsetDateTime.class));

    public record StoredItem(long id, long dealerId, long priceListId, long companyId,
                             String tradeName, String normalizedTradeName, String technicalName,
                             String normalizedTechnicalName, BigDecimal unitSize, String unit,
                             BigDecimal matchUnitSize, String matchUnit, BigDecimal priceExGstPerUnit,
                             BigDecimal gstPercent, BigDecimal priceInclGstPerUnit, BigDecimal mrpPerUnit,
                             String category, String comments, String sourceReference,
                             String reviewStatus, String reviewNotes, boolean current,
                             LocalDate effectiveDate, String effectivePeriodText, String listStatus) {}

    public record CreatedImport(long importId, long companyId) {}
}
