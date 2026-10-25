package com.example.fertilizer.customerledger;

import com.example.fertilizer.billing.dto.BillingRequest;
import com.example.fertilizer.billing.dto.BillingResponse;
import com.example.fertilizer.customerledger.dto.CustomerCreateRequest;
import com.example.fertilizer.customerledger.dto.CustomerDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditItemRequest;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditRequest;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceItemDto;
import com.example.fertilizer.customerledger.dto.CustomerLedgerEntryDto;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.sql.Date;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class CustomerLedgerRepository {
    private final JdbcTemplate jdbc;

    public CustomerLedgerRepository(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public boolean dealerExists(long dealerId) {
        return dealerId > 0 && Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM dealers WHERE id = ? AND active = TRUE)
                """, Boolean.class, dealerId));
    }

    public List<CustomerDto> findCustomers(long dealerId) {
        return jdbc.query("""
                SELECT c.id, c.customer_name, c.phone, c.email, c.address, c.gstin, c.state_code,
                       COALESCE(SUM(e.debit_amount - e.credit_amount), 0) AS balance
                FROM customers c
                LEFT JOIN customer_ledger_entries e
                  ON e.customer_id = c.id AND e.dealer_id = c.dealer_id
                WHERE c.dealer_id = ? AND c.active = TRUE
                GROUP BY c.id
                ORDER BY c.customer_name
                """, (rs, row) -> new CustomerDto(
                rs.getLong("id"), rs.getString("customer_name"), rs.getString("phone"),
                rs.getString("email"), rs.getString("address"), rs.getString("gstin"),
                rs.getString("state_code"), rs.getBigDecimal("balance")), dealerId);
    }

    public boolean customerExists(long dealerId, long customerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM customers
                    WHERE dealer_id = ? AND id = ? AND active = TRUE
                )
                """, Boolean.class, dealerId, customerId));
    }

    public boolean customerNameExists(long dealerId, String customerName) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM customers
                    WHERE dealer_id = ? AND LOWER(customer_name) = LOWER(?)
                )
                """, Boolean.class, dealerId, customerName));
    }

    public boolean productExists(long dealerId, long productId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM products WHERE dealer_id = ? AND id = ?)
                """, Boolean.class, dealerId, productId));
    }

    public long createCustomer(long dealerId, CustomerCreateRequest request) {
        return jdbc.queryForObject("""
                INSERT INTO customers (dealer_id, customer_name, phone, email, address, gstin, state_code)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, request.customerName().trim(), blankToNull(request.phone()),
                blankToNull(request.email()), blankToNull(request.address()), blankToNull(request.gstin()),
                blankToNull(request.stateCode()));
    }

    public boolean openingEntryExists(long dealerId, long customerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
                SELECT EXISTS (
                    SELECT 1 FROM customer_ledger_entries
                    WHERE dealer_id = ? AND customer_id = ? AND entry_type = 'OPENING'
                )
                """, Boolean.class, dealerId, customerId));
    }

    public long createLedgerEntry(long dealerId, long customerId, long userId, String entryType,
                                  LocalDate entryDate, String reference, String notes,
                                  BigDecimal debit, BigDecimal credit) {
        return jdbc.queryForObject("""
                INSERT INTO customer_ledger_entries
                    (dealer_id, customer_id, entry_type, entry_date, reference, notes,
                     debit_amount, credit_amount, created_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, customerId, entryType, Date.valueOf(entryDate),
                blankToNull(reference), blankToNull(notes), debit, credit, userId);
    }

    public List<CustomerLedgerEntryDto> findEntries(long dealerId, long customerId,
                                                    LocalDate fromDate, LocalDate toDate) {
        StringBuilder sql = new StringBuilder("""
                WITH balances AS (
                    SELECT e.id, e.entry_type, e.entry_date, e.reference, e.notes,
                           e.debit_amount, e.credit_amount, e.invoice_id,
                           i.invoice_number, u.full_name AS created_by,
                           SUM(e.debit_amount - e.credit_amount) OVER (
                               PARTITION BY e.dealer_id, e.customer_id
                               ORDER BY e.entry_date, e.id
                           ) AS running_balance
                    FROM customer_ledger_entries e
                    JOIN app_users u ON u.id = e.created_by
                    LEFT JOIN customer_invoices i
                      ON i.id = e.invoice_id AND i.dealer_id = e.dealer_id
                    WHERE e.dealer_id = ? AND e.customer_id = ?
                )
                SELECT id, entry_type, entry_date, reference, notes, debit_amount,
                       credit_amount, running_balance, invoice_id, invoice_number, created_by
                FROM balances
                WHERE 1 = 1
                """);
        List<Object> args = new ArrayList<>(List.of(dealerId, customerId));
        if (fromDate != null) {
            sql.append(" AND entry_date >= ?");
            args.add(Date.valueOf(fromDate));
        }
        if (toDate != null) {
            sql.append(" AND entry_date <= ?");
            args.add(Date.valueOf(toDate));
        }
        sql.append(" ORDER BY entry_date, id");
        return jdbc.query(sql.toString(), (rs, row) -> new CustomerLedgerEntryDto(
                rs.getLong("id"), rs.getString("entry_type"), rs.getDate("entry_date").toLocalDate(),
                rs.getString("reference"), rs.getString("notes"), rs.getBigDecimal("debit_amount"),
                rs.getBigDecimal("credit_amount"), rs.getBigDecimal("running_balance"),
                rs.getObject("invoice_id", Long.class), rs.getString("invoice_number"),
                rs.getString("created_by")), args.toArray());
    }

    public CustomerInvoiceDto createInvoice(long dealerId, long customerId, long userId,
                                            BillingRequest request, BillingResponse bill) {
        Long sequence = jdbc.queryForObject("SELECT nextval('customer_invoice_number_seq')", Long.class);
        if (sequence == null) throw new IllegalStateException("Could not allocate a customer invoice number.");
        String invoiceNumber = "ADH-" + String.format(Locale.ROOT, "%08d", sequence);
        LocalDate invoiceDate = bill.generatedAt().toLocalDate();
        CustomerSnapshot customer = jdbc.queryForObject("""
                SELECT customer_name, phone, address, gstin
                FROM customers
                WHERE dealer_id = ? AND id = ? AND active = TRUE
                """, (rs, row) -> new CustomerSnapshot(
                rs.getString("customer_name"), rs.getString("phone"),
                rs.getString("address"), rs.getString("gstin")), dealerId, customerId);
        if (customer == null) throw new IllegalStateException("Active customer details were not returned.");
        String destinationStateCode = request.destinationStateCode() == null
                || request.destinationStateCode().isBlank()
                ? bill.dealer().stateCode() : request.destinationStateCode().trim();
        Long invoiceId = jdbc.queryForObject("""
                INSERT INTO customer_invoices (
                    dealer_id, customer_id, invoice_number, invoice_date, customer_name,
                    customer_phone, customer_address, customer_gstin, bill_type,
                    dealer_name, dealer_address_line1, dealer_address_line2, dealer_city,
                    dealer_state_name, dealer_pincode, dealer_gstin,
                    destination_state_code, tax_type, taxable_total, cgst_total, sgst_total,
                    igst_total, grand_total, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, customerId, invoiceNumber, Date.valueOf(invoiceDate),
                customer.name(), customer.phone(), customer.address(), customer.gstin(),
                normalizedBillType(request.billType()), bill.dealer().displayName(),
                bill.dealer().addressLine1(), bill.dealer().addressLine2(), bill.dealer().city(),
                bill.dealer().stateName(), bill.dealer().pincode(), bill.dealer().gstin(),
                destinationStateCode, bill.taxType(),
                bill.taxableTotal(), bill.cgstTotal(), bill.sgstTotal(), bill.igstTotal(),
                bill.grandTotal(), userId);
        if (invoiceId == null) throw new IllegalStateException("Created customer invoice was not returned.");

        List<CustomerInvoiceItemDto> items = new ArrayList<>();
        for (int index = 0; index < bill.items().size(); index++) {
            BillingResponse.BillLine line = bill.items().get(index);
            BillingRequest.ItemRequest input = request.items().get(index);
            BigDecimal bagSizeKg = line.quantityKg().divide(
                    BigDecimal.valueOf(line.bags()), 3, RoundingMode.HALF_UP);
            CustomerInvoiceItemDto item = new CustomerInvoiceItemDto(
                    index + 1, input.productId(), line.productName(), line.hsnCode(), bagSizeKg,
                    line.bags(), line.quantityKg(), line.rateInclGst(), line.gstRate(),
                    line.taxableAmount(), line.cgst(), line.sgst(), line.igst(), line.amountInclGst());
            jdbc.update("""
                    INSERT INTO customer_invoice_items (
                        dealer_id, invoice_id, line_number, product_id, product_name, hsn_code,
                        bag_size_kg, bags, quantity_kg, rate_incl_gst, gst_rate, taxable_amount,
                        cgst_amount, sgst_amount, igst_amount, line_total
                    )
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, dealerId, invoiceId, item.lineNumber(), item.productId(), item.productName(),
                    item.hsnCode(), item.bagSizeKg(), item.bags(), item.quantityKg(), item.rateInclGst(),
                    item.gstRate(), item.taxableAmount(), item.cgstAmount(), item.sgstAmount(),
                    item.igstAmount(), item.lineTotal());
            items.add(item);
        }

        createLedgerEntry(dealerId, customerId, userId, "BILL", invoiceDate, invoiceNumber,
                "Bill " + invoiceNumber, bill.grandTotal(), BigDecimal.ZERO, invoiceId);
        if ("CASH".equalsIgnoreCase(request.billType())) {
            createLedgerEntry(dealerId, customerId, userId, "PAYMENT", invoiceDate, invoiceNumber,
                    "Cash settlement for bill " + invoiceNumber, BigDecimal.ZERO, bill.grandTotal(), invoiceId);
        }

        String createdBy = jdbc.queryForObject("SELECT full_name FROM app_users WHERE id = ?", String.class, userId);
        return new CustomerInvoiceDto(invoiceId, invoiceNumber, invoiceDate,
                customer.name(), customer.phone(), customer.address(), customer.gstin(),
                bill.dealer().displayName(), bill.dealer().addressLine1(), bill.dealer().addressLine2(),
                bill.dealer().city(), bill.dealer().stateName(), bill.dealer().pincode(), bill.dealer().gstin(),
                normalizedBillType(request.billType()), destinationStateCode, bill.taxType(),
                bill.taxableTotal(), bill.cgstTotal(), bill.sgstTotal(), bill.igstTotal(),
                bill.grandTotal(), createdBy, List.copyOf(items));
    }

    public Optional<CustomerInvoiceDto> findInvoice(long dealerId, long customerId, long invoiceId) {
        List<CustomerInvoiceDto> invoices = jdbc.query("""
                SELECT i.id, i.invoice_number, i.invoice_date, i.bill_type, i.destination_state_code,
                       i.customer_name, i.customer_phone, i.customer_address, i.customer_gstin,
                       i.dealer_name, i.dealer_address_line1, i.dealer_address_line2,
                       i.dealer_city, i.dealer_state_name, i.dealer_pincode, i.dealer_gstin,
                       i.tax_type, i.taxable_total, i.cgst_total, i.sgst_total, i.igst_total,
                       i.grand_total, u.full_name AS created_by
                FROM customer_invoices i
                JOIN app_users u ON u.id = i.created_by
                WHERE i.dealer_id = ? AND i.customer_id = ? AND i.id = ?
                """, (rs, row) -> new CustomerInvoiceDto(
                rs.getLong("id"), rs.getString("invoice_number"), rs.getDate("invoice_date").toLocalDate(),
                rs.getString("customer_name"), rs.getString("customer_phone"),
                rs.getString("customer_address"), rs.getString("customer_gstin"),
                rs.getString("dealer_name"), rs.getString("dealer_address_line1"),
                rs.getString("dealer_address_line2"), rs.getString("dealer_city"),
                rs.getString("dealer_state_name"), rs.getString("dealer_pincode"), rs.getString("dealer_gstin"),
                rs.getString("bill_type"), rs.getString("destination_state_code"), rs.getString("tax_type"),
                rs.getBigDecimal("taxable_total"), rs.getBigDecimal("cgst_total"),
                rs.getBigDecimal("sgst_total"), rs.getBigDecimal("igst_total"),
                rs.getBigDecimal("grand_total"), rs.getString("created_by"), List.of()),
                dealerId, customerId, invoiceId);
        if (invoices.isEmpty()) return Optional.empty();
        CustomerInvoiceDto header = invoices.get(0);
        List<CustomerInvoiceItemDto> items = jdbc.query("""
                SELECT line_number, product_id, product_name, hsn_code, bag_size_kg, bags,
                       quantity_kg, rate_incl_gst, gst_rate, taxable_amount, cgst_amount,
                       sgst_amount, igst_amount, line_total
                FROM customer_invoice_items
                WHERE dealer_id = ? AND invoice_id = ?
                ORDER BY line_number
                """, (rs, row) -> new CustomerInvoiceItemDto(
                rs.getInt("line_number"), rs.getObject("product_id", Long.class),
                rs.getString("product_name"), rs.getString("hsn_code"), rs.getBigDecimal("bag_size_kg"),
                rs.getInt("bags"), rs.getBigDecimal("quantity_kg"), rs.getBigDecimal("rate_incl_gst"),
                rs.getBigDecimal("gst_rate"), rs.getBigDecimal("taxable_amount"),
                rs.getBigDecimal("cgst_amount"), rs.getBigDecimal("sgst_amount"),
                rs.getBigDecimal("igst_amount"), rs.getBigDecimal("line_total")), dealerId, invoiceId);
        return Optional.of(new CustomerInvoiceDto(header.id(), header.invoiceNumber(), header.invoiceDate(),
                header.customerName(), header.customerPhone(), header.customerAddress(), header.customerGstin(),
                header.dealerName(), header.dealerAddressLine1(), header.dealerAddressLine2(),
                header.dealerCity(), header.dealerStateName(), header.dealerPincode(), header.dealerGstin(),
                header.billType(), header.destinationStateCode(), header.taxType(), header.taxableTotal(),
                header.cgstTotal(), header.sgstTotal(), header.igstTotal(), header.grandTotal(),
                header.createdBy(), List.copyOf(items)));
    }

    public Optional<CustomerInvoiceDto> lockInvoiceForEdit(long dealerId, long customerId, long invoiceId) {
        List<Long> invoiceIds = jdbc.query("""
                SELECT id FROM customer_invoices
                WHERE dealer_id = ? AND customer_id = ? AND id = ?
                FOR UPDATE
                """, (rs, row) -> rs.getLong("id"), dealerId, customerId, invoiceId);
        return invoiceIds.isEmpty() ? Optional.empty() : findInvoice(dealerId, customerId, invoiceId);
    }

    public CustomerInvoiceDto updateInvoice(long dealerId, long customerId, long userId,
                                            CustomerInvoiceDto previous, String reason,
                                            List<CustomerInvoiceEditItemRequest> requestedItems,
                                            BillingResponse bill) {
        Long editId = jdbc.queryForObject("""
                INSERT INTO customer_invoice_edits (
                    dealer_id, customer_id, invoice_id, reason,
                    previous_taxable_total, previous_cgst_total, previous_sgst_total,
                    previous_igst_total, previous_grand_total, updated_taxable_total,
                    updated_cgst_total, updated_sgst_total, updated_igst_total,
                    updated_grand_total, edited_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                RETURNING id
                """, Long.class, dealerId, customerId, previous.id(), reason,
                previous.taxableTotal(), previous.cgstTotal(), previous.sgstTotal(),
                previous.igstTotal(), previous.grandTotal(), bill.taxableTotal(),
                bill.cgstTotal(), bill.sgstTotal(), bill.igstTotal(), bill.grandTotal(), userId);
        if (editId == null) throw new IllegalStateException("Invoice edit history was not created.");

        jdbc.update("""
                INSERT INTO customer_invoice_edit_items (
                    edit_id, snapshot_side, line_number, product_id, product_name, hsn_code,
                    bag_size_kg, bags, quantity_kg, rate_incl_gst, gst_rate, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, line_total
                )
                SELECT ?, 'BEFORE', line_number, product_id, product_name, hsn_code,
                       bag_size_kg, bags, quantity_kg, rate_incl_gst, gst_rate, taxable_amount,
                       cgst_amount, sgst_amount, igst_amount, line_total
                FROM customer_invoice_items
                WHERE dealer_id = ? AND invoice_id = ?
                """, editId, dealerId, previous.id());
        jdbc.update("DELETE FROM customer_invoice_items WHERE dealer_id = ? AND invoice_id = ?",
                dealerId, previous.id());

        List<CustomerInvoiceItemDto> updatedItems = new ArrayList<>();
        for (int index = 0; index < bill.items().size(); index++) {
            BillingResponse.BillLine line = bill.items().get(index);
            CustomerInvoiceEditItemRequest input = requestedItems.get(index);
            BigDecimal bagSizeKg = line.quantityKg().divide(
                    BigDecimal.valueOf(line.bags()), 3, RoundingMode.HALF_UP);
            CustomerInvoiceItemDto item = new CustomerInvoiceItemDto(
                    index + 1, input.productId(), line.productName(), line.hsnCode(), bagSizeKg,
                    line.bags(), line.quantityKg(), line.rateInclGst(), line.gstRate(),
                    line.taxableAmount(), line.cgst(), line.sgst(), line.igst(), line.amountInclGst());
            insertInvoiceItem(dealerId, previous.id(), item);
            jdbc.update("""
                    INSERT INTO customer_invoice_edit_items (
                        edit_id, snapshot_side, line_number, product_id, product_name, hsn_code,
                        bag_size_kg, bags, quantity_kg, rate_incl_gst, gst_rate, taxable_amount,
                        cgst_amount, sgst_amount, igst_amount, line_total
                    )
                    VALUES (?, 'AFTER', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """, editId, item.lineNumber(), item.productId(), item.productName(), item.hsnCode(),
                    item.bagSizeKg(), item.bags(), item.quantityKg(), item.rateInclGst(), item.gstRate(),
                    item.taxableAmount(), item.cgstAmount(), item.sgstAmount(), item.igstAmount(), item.lineTotal());
            updatedItems.add(item);
        }

        jdbc.update("""
                UPDATE customer_invoices
                SET taxable_total = ?, cgst_total = ?, sgst_total = ?, igst_total = ?, grand_total = ?
                WHERE dealer_id = ? AND customer_id = ? AND id = ?
                """, bill.taxableTotal(), bill.cgstTotal(), bill.sgstTotal(), bill.igstTotal(),
                bill.grandTotal(), dealerId, customerId, previous.id());

        BigDecimal difference = bill.grandTotal().subtract(previous.grandTotal());
        if (difference.signum() > 0) {
            createLedgerEntry(dealerId, customerId, userId, "ADJUSTMENT", LocalDate.now(),
                    previous.invoiceNumber(), "Invoice correction for bill " + previous.invoiceNumber() + "; see edit history.",
                    difference, BigDecimal.ZERO, previous.id());
        } else if (difference.signum() < 0) {
            createLedgerEntry(dealerId, customerId, userId, "ADJUSTMENT", LocalDate.now(),
                    previous.invoiceNumber(), "Invoice correction for bill " + previous.invoiceNumber() + "; see edit history.",
                    BigDecimal.ZERO, difference.abs(), previous.id());
        }

        return new CustomerInvoiceDto(previous.id(), previous.invoiceNumber(), previous.invoiceDate(),
                previous.customerName(), previous.customerPhone(), previous.customerAddress(), previous.customerGstin(),
                previous.dealerName(), previous.dealerAddressLine1(), previous.dealerAddressLine2(),
                previous.dealerCity(), previous.dealerStateName(), previous.dealerPincode(), previous.dealerGstin(),
                previous.billType(), previous.destinationStateCode(), bill.taxType(), bill.taxableTotal(),
                bill.cgstTotal(), bill.sgstTotal(), bill.igstTotal(), bill.grandTotal(), previous.createdBy(),
                List.copyOf(updatedItems));
    }

    public List<CustomerInvoiceEditDto> findInvoiceEdits(long dealerId, long customerId, long invoiceId) {
        List<CustomerInvoiceEditDto> edits = jdbc.query("""
                SELECT e.id, e.reason, e.edited_at, u.full_name AS edited_by,
                       e.previous_taxable_total, e.previous_cgst_total, e.previous_sgst_total,
                       e.previous_igst_total, e.previous_grand_total, e.updated_taxable_total,
                       e.updated_cgst_total, e.updated_sgst_total, e.updated_igst_total,
                       e.updated_grand_total
                FROM customer_invoice_edits e
                JOIN app_users u ON u.id = e.edited_by
                WHERE e.dealer_id = ? AND e.customer_id = ? AND e.invoice_id = ?
                ORDER BY e.edited_at DESC, e.id DESC
                """, (rs, row) -> new CustomerInvoiceEditDto(
                rs.getLong("id"), rs.getString("reason"), rs.getObject("edited_at", OffsetDateTime.class),
                rs.getString("edited_by"), rs.getBigDecimal("previous_taxable_total"),
                rs.getBigDecimal("previous_cgst_total"), rs.getBigDecimal("previous_sgst_total"),
                rs.getBigDecimal("previous_igst_total"), rs.getBigDecimal("previous_grand_total"),
                rs.getBigDecimal("updated_taxable_total"), rs.getBigDecimal("updated_cgst_total"),
                rs.getBigDecimal("updated_sgst_total"), rs.getBigDecimal("updated_igst_total"),
                rs.getBigDecimal("updated_grand_total"), List.of(), List.of()),
                dealerId, customerId, invoiceId);
        return edits.stream().map(edit -> new CustomerInvoiceEditDto(
                edit.id(), edit.reason(), edit.editedAt(), edit.editedBy(),
                edit.previousTaxableTotal(), edit.previousCgstTotal(), edit.previousSgstTotal(),
                edit.previousIgstTotal(), edit.previousGrandTotal(), edit.updatedTaxableTotal(),
                edit.updatedCgstTotal(), edit.updatedSgstTotal(), edit.updatedIgstTotal(),
                edit.updatedGrandTotal(), findEditItems(edit.id(), "BEFORE"),
                findEditItems(edit.id(), "AFTER"))).toList();
    }

    private List<CustomerInvoiceItemDto> findEditItems(long editId, String side) {
        return jdbc.query("""
                SELECT line_number, product_id, product_name, hsn_code, bag_size_kg, bags,
                       quantity_kg, rate_incl_gst, gst_rate, taxable_amount, cgst_amount,
                       sgst_amount, igst_amount, line_total
                FROM customer_invoice_edit_items
                WHERE edit_id = ? AND snapshot_side = ?
                ORDER BY line_number
                """, (rs, row) -> new CustomerInvoiceItemDto(
                rs.getInt("line_number"), rs.getObject("product_id", Long.class),
                rs.getString("product_name"), rs.getString("hsn_code"), rs.getBigDecimal("bag_size_kg"),
                rs.getInt("bags"), rs.getBigDecimal("quantity_kg"), rs.getBigDecimal("rate_incl_gst"),
                rs.getBigDecimal("gst_rate"), rs.getBigDecimal("taxable_amount"),
                rs.getBigDecimal("cgst_amount"), rs.getBigDecimal("sgst_amount"),
                rs.getBigDecimal("igst_amount"), rs.getBigDecimal("line_total")), editId, side);
    }

    private void insertInvoiceItem(long dealerId, long invoiceId, CustomerInvoiceItemDto item) {
        jdbc.update("""
                INSERT INTO customer_invoice_items (
                    dealer_id, invoice_id, line_number, product_id, product_name, hsn_code,
                    bag_size_kg, bags, quantity_kg, rate_incl_gst, gst_rate, taxable_amount,
                    cgst_amount, sgst_amount, igst_amount, line_total
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, dealerId, invoiceId, item.lineNumber(), item.productId(), item.productName(),
                item.hsnCode(), item.bagSizeKg(), item.bags(), item.quantityKg(), item.rateInclGst(),
                item.gstRate(), item.taxableAmount(), item.cgstAmount(), item.sgstAmount(),
                item.igstAmount(), item.lineTotal());
    }

    private void createLedgerEntry(long dealerId, long customerId, long userId, String entryType,
                                  LocalDate entryDate, String reference, String notes,
                                  BigDecimal debit, BigDecimal credit, Long invoiceId) {
        jdbc.update("""
                INSERT INTO customer_ledger_entries (
                    dealer_id, customer_id, invoice_id, entry_type, entry_date, reference,
                    notes, debit_amount, credit_amount, created_by
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """, dealerId, customerId, invoiceId, entryType, Date.valueOf(entryDate),
                reference, notes, debit, credit, userId);
    }

    private String normalizedBillType(String billType) {
        return "CREDIT".equalsIgnoreCase(billType) ? "CREDIT" : "CASH";
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private record CustomerSnapshot(String name, String phone, String address, String gstin) {}
}
