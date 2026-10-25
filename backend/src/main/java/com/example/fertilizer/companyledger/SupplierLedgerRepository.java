package com.example.fertilizer.companyledger;

import com.example.fertilizer.companyledger.dto.SupplierCreateRequest;
import com.example.fertilizer.companyledger.dto.SupplierDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryEditDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntrySnapshotDto;
import java.math.BigDecimal;
import java.sql.Date;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class SupplierLedgerRepository {
    private final JdbcTemplate jdbc;

    public SupplierLedgerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean dealerExists(long dealerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM dealers WHERE id = ? AND active = TRUE)
                """, Boolean.class, dealerId));
    }

    public List<SupplierDto> findSuppliers(long dealerId) {
        return jdbc.query("""
                SELECT s.id, s.supplier_name, s.supplier_code, s.contact_name, s.phone,
                       s.email, s.address, s.active,
                       COALESCE(SUM(e.credit_amount - e.debit_amount), 0) AS balance
                FROM suppliers s
                LEFT JOIN supplier_ledger_entries e
                  ON e.supplier_id = s.id AND e.dealer_id = s.dealer_id
                WHERE s.dealer_id = ? AND s.active = TRUE
                GROUP BY s.id
                ORDER BY s.supplier_name
                """, (rs, row) -> new SupplierDto(
                rs.getLong("id"), rs.getString("supplier_name"), rs.getString("supplier_code"),
                rs.getString("contact_name"), rs.getString("phone"), rs.getString("email"),
                rs.getString("address"), rs.getBoolean("active"), rs.getBigDecimal("balance")), dealerId);
    }

    public boolean supplierExists(long dealerId, long supplierId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM suppliers
                    WHERE dealer_id = ? AND id = ? AND active = TRUE
                )
                """, Boolean.class, dealerId, supplierId));
    }

    public boolean supplierNameExists(long dealerId, String supplierName) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM suppliers
                    WHERE dealer_id = ? AND LOWER(supplier_name) = LOWER(?)
                )
                """, Boolean.class, dealerId, supplierName));
    }

    public long createSupplier(long dealerId, SupplierCreateRequest request) {
        return jdbc.queryForObject("""
                INSERT INTO suppliers
                    (dealer_id, supplier_name, supplier_code, contact_name, phone, email, address)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, request.supplierName().trim(), blankToNull(request.supplierCode()),
                blankToNull(request.contactName()), blankToNull(request.phone()),
                blankToNull(request.email()), blankToNull(request.address()));
    }

    public boolean openingEntryExists(long dealerId, long supplierId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM supplier_ledger_entries
                    WHERE dealer_id = ? AND supplier_id = ? AND entry_type = 'OPENING'
                )
                """, Boolean.class, dealerId, supplierId));
    }

    public boolean purchaseReferenceExists(long dealerId, long supplierId, String reference) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM supplier_ledger_entries
                    WHERE dealer_id = ? AND supplier_id = ? AND entry_type = 'PURCHASE'
                      AND LOWER(reference) = LOWER(?)
                )
                """, Boolean.class, dealerId, supplierId, reference));
    }

    public boolean openingEntryExistsExcept(long dealerId, long supplierId, long entryId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM supplier_ledger_entries
                    WHERE dealer_id = ? AND supplier_id = ? AND entry_type = 'OPENING' AND id <> ?
                )
                """, Boolean.class, dealerId, supplierId, entryId));
    }

    public boolean purchaseReferenceExistsExcept(long dealerId, long supplierId, String reference, long entryId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM supplier_ledger_entries
                    WHERE dealer_id = ? AND supplier_id = ? AND entry_type = 'PURCHASE'
                      AND LOWER(reference) = LOWER(?) AND id <> ?
                )
                """, Boolean.class, dealerId, supplierId, reference, entryId));
    }

    public Optional<LedgerEntryState> findEntryForUpdate(long dealerId, long supplierId, long entryId) {
        List<LedgerEntryState> entries = jdbc.query("""
                SELECT id, entry_type, entry_date, reference, notes, debit_amount, credit_amount
                FROM supplier_ledger_entries
                WHERE dealer_id = ? AND supplier_id = ? AND id = ?
                FOR UPDATE
                """, (rs, row) -> new LedgerEntryState(
                rs.getLong("id"), rs.getString("entry_type"), rs.getDate("entry_date").toLocalDate(),
                rs.getString("reference"), rs.getString("notes"), rs.getBigDecimal("debit_amount"),
                rs.getBigDecimal("credit_amount")), dealerId, supplierId, entryId);
        return entries.stream().findFirst();
    }

    public boolean entryExists(long dealerId, long supplierId, long entryId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM supplier_ledger_entries
                    WHERE dealer_id = ? AND supplier_id = ? AND id = ?
                )
                """, Boolean.class, dealerId, supplierId, entryId));
    }

    public List<SupplierLedgerEntryEditDto> findEntryEdits(long dealerId, long supplierId, long entryId) {
        return jdbc.query("""
                SELECT edits.id, edits.changed_at, users.full_name AS changed_by,
                       edits.previous_entry_type, edits.previous_entry_date, edits.previous_reference,
                       edits.previous_notes, edits.previous_debit_amount, edits.previous_credit_amount,
                       edits.updated_entry_type, edits.updated_entry_date, edits.updated_reference,
                       edits.updated_notes, edits.updated_debit_amount, edits.updated_credit_amount
                FROM supplier_ledger_entry_edits edits
                JOIN supplier_ledger_entries entries ON entries.id = edits.ledger_entry_id
                JOIN app_users users ON users.id = edits.changed_by
                WHERE entries.dealer_id = ? AND entries.supplier_id = ? AND entries.id = ?
                ORDER BY edits.changed_at DESC, edits.id DESC
                """, (rs, row) -> new SupplierLedgerEntryEditDto(
                rs.getLong("id"), rs.getObject("changed_at", java.time.OffsetDateTime.class),
                rs.getString("changed_by"),
                new SupplierLedgerEntrySnapshotDto(
                        rs.getString("previous_entry_type"), rs.getDate("previous_entry_date").toLocalDate(),
                        rs.getString("previous_reference"), rs.getString("previous_notes"),
                        rs.getBigDecimal("previous_debit_amount"), rs.getBigDecimal("previous_credit_amount")),
                new SupplierLedgerEntrySnapshotDto(
                        rs.getString("updated_entry_type"), rs.getDate("updated_entry_date").toLocalDate(),
                        rs.getString("updated_reference"), rs.getString("updated_notes"),
                        rs.getBigDecimal("updated_debit_amount"), rs.getBigDecimal("updated_credit_amount"))),
                dealerId, supplierId, entryId);
    }

    public boolean updateEntry(long userId, LedgerEntryState previous, String entryType,
                               LocalDate entryDate, String reference, String notes,
                               BigDecimal debitAmount, BigDecimal creditAmount) {
        String normalizedReference = blankToNull(reference);
        String normalizedNotes = blankToNull(notes);
        if (previous.matches(entryType, entryDate, normalizedReference, normalizedNotes, debitAmount, creditAmount))
            return false;

        int updated = jdbc.update("""
                UPDATE supplier_ledger_entries
                SET entry_type = ?, entry_date = ?, reference = ?, notes = ?,
                    debit_amount = ?, credit_amount = ?
                WHERE id = ?
                """, entryType, Date.valueOf(entryDate), normalizedReference, normalizedNotes,
                debitAmount, creditAmount, previous.id());
        if (updated != 1) throw new IllegalStateException("Locked supplier ledger entry could not be updated.");

        jdbc.update("""
                INSERT INTO supplier_ledger_entry_edits (
                    ledger_entry_id, changed_by,
                    previous_entry_type, previous_entry_date, previous_reference, previous_notes,
                    previous_debit_amount, previous_credit_amount,
                    updated_entry_type, updated_entry_date, updated_reference, updated_notes,
                    updated_debit_amount, updated_credit_amount
                )
                VALUES (?, ?,
                    ?, ?, ?, ?, ?, ?,
                    ?, ?, ?, ?, ?, ?
                )
                """, previous.id(), userId,
                previous.entryType(), Date.valueOf(previous.entryDate()), previous.reference(), previous.notes(),
                previous.debitAmount(), previous.creditAmount(),
                entryType, Date.valueOf(entryDate), normalizedReference, normalizedNotes,
                debitAmount, creditAmount);
        return true;
    }

    public long createEntry(long dealerId, long supplierId, long userId, String entryType,
                            LocalDate entryDate, String reference, String notes,
                            BigDecimal debitAmount, BigDecimal creditAmount) {
        return jdbc.queryForObject("""
                INSERT INTO supplier_ledger_entries
                    (dealer_id, supplier_id, entry_type, entry_date, reference, notes,
                     debit_amount, credit_amount, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, supplierId, entryType, Date.valueOf(entryDate),
                blankToNull(reference), blankToNull(notes), debitAmount, creditAmount, userId);
    }

    public List<SupplierLedgerEntryDto> findEntries(long dealerId, long supplierId,
                                                    LocalDate fromDate, LocalDate toDate) {
        StringBuilder sql = new StringBuilder("""
                WITH balances AS (
                    SELECT e.id, e.entry_type, e.entry_date, e.reference, e.notes,
                           e.debit_amount, e.credit_amount, u.full_name AS created_by,
                           SUM(e.credit_amount - e.debit_amount) OVER (
                               PARTITION BY e.dealer_id, e.supplier_id
                               ORDER BY e.entry_date, e.id
                           ) AS running_balance
                    FROM supplier_ledger_entries e
                    JOIN app_users u ON u.id = e.created_by
                    WHERE e.dealer_id = ? AND e.supplier_id = ?
                )
                SELECT id, entry_type, entry_date, reference, notes, debit_amount,
                       credit_amount, running_balance, created_by
                FROM balances
                WHERE 1 = 1
                """);
        List<Object> args = new ArrayList<>(List.of(dealerId, supplierId));
        if (fromDate != null) {
            sql.append(" AND entry_date >= ?");
            args.add(Date.valueOf(fromDate));
        }
        if (toDate != null) {
            sql.append(" AND entry_date <= ?");
            args.add(Date.valueOf(toDate));
        }
        sql.append(" ORDER BY entry_date, id");
        return jdbc.query(sql.toString(), (rs, row) -> new SupplierLedgerEntryDto(
                rs.getLong("id"), rs.getString("entry_type"), rs.getDate("entry_date").toLocalDate(),
                rs.getString("reference"), rs.getString("notes"), rs.getBigDecimal("debit_amount"),
                rs.getBigDecimal("credit_amount"), rs.getBigDecimal("running_balance"),
                rs.getString("created_by")), args.toArray());
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    public record LedgerEntryState(Long id, String entryType, LocalDate entryDate, String reference,
                                   String notes, BigDecimal debitAmount, BigDecimal creditAmount) {
        public boolean matches(String type, LocalDate date, String updatedReference, String updatedNotes,
                               BigDecimal debit, BigDecimal credit) {
            return entryType.equals(type) && entryDate.equals(date)
                    && java.util.Objects.equals(reference, updatedReference)
                    && java.util.Objects.equals(notes, updatedNotes)
                    && debitAmount.compareTo(debit) == 0 && creditAmount.compareTo(credit) == 0;
        }
    }
}
