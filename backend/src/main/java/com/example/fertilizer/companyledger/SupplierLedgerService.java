package com.example.fertilizer.companyledger;

import com.example.fertilizer.companyledger.dto.SupplierCreateRequest;
import com.example.fertilizer.companyledger.dto.SupplierDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryEditDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class SupplierLedgerService {
    private final SupplierLedgerRepository repository;

    public SupplierLedgerService(SupplierLedgerRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public boolean dealerExists(long dealerId) {
        return dealerId > 0 && repository.dealerExists(dealerId);
    }

    @Transactional(readOnly = true)
    public List<SupplierDto> getSuppliers(long dealerId) {
        return repository.findSuppliers(dealerId);
    }

    @Transactional
    public long createSupplier(long dealerId, SupplierCreateRequest request) {
        if (repository.supplierNameExists(dealerId, request.supplierName().trim()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A supplier with this name already exists.");
        return repository.createSupplier(dealerId, request);
    }

    @Transactional(readOnly = true)
    public List<SupplierLedgerEntryDto> getEntries(long dealerId, long supplierId,
                                                   LocalDate fromDate, LocalDate toDate) {
        if (!repository.supplierExists(dealerId, supplierId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active supplier was not found.");
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "To Date cannot be earlier than From Date.");
        return repository.findEntries(dealerId, supplierId, fromDate, toDate);
    }

    @Transactional(readOnly = true)
    public List<SupplierLedgerEntryEditDto> getEntryEdits(long dealerId, long supplierId, long entryId) {
        if (!repository.supplierExists(dealerId, supplierId)
                || !repository.entryExists(dealerId, supplierId, entryId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Supplier ledger entry was not found.");
        return repository.findEntryEdits(dealerId, supplierId, entryId);
    }

    @Transactional
    public long createEntry(long dealerId, long supplierId, long userId,
                            SupplierLedgerEntryRequest request) {
        if (!repository.supplierExists(dealerId, supplierId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active supplier was not found.");
        EntryAmounts amounts = validateEntry(dealerId, supplierId, request, null);
        return repository.createEntry(dealerId, supplierId, userId, request.entryType(),
                request.entryDate(), request.reference(), request.notes(), amounts.debit(), amounts.credit());
    }

    @Transactional
    public boolean updateEntry(long dealerId, long supplierId, long entryId, long userId,
                               SupplierLedgerEntryRequest request) {
        if (!repository.supplierExists(dealerId, supplierId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active supplier was not found.");
        SupplierLedgerRepository.LedgerEntryState previous = repository.findEntryForUpdate(
                        dealerId, supplierId, entryId)
                .orElseThrow(() -> new ResponseStatusException(
                        HttpStatus.NOT_FOUND, "Supplier ledger entry was not found."));
        EntryAmounts amounts = validateEntry(dealerId, supplierId, request, entryId);
        return repository.updateEntry(userId, previous, request.entryType(), request.entryDate(),
                request.reference(), request.notes(), amounts.debit(), amounts.credit());
    }

    private EntryAmounts validateEntry(long dealerId, long supplierId,
                                       SupplierLedgerEntryRequest request, Long ignoredEntryId) {
        BigDecimal debit = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        switch (request.entryType()) {
            case "PURCHASE" -> {
                credit = request.amount();
                if (request.reference() != null && !request.reference().isBlank()) {
                    boolean duplicate = ignoredEntryId == null
                            ? repository.purchaseReferenceExists(dealerId, supplierId, request.reference().trim())
                            : repository.purchaseReferenceExistsExcept(
                                    dealerId, supplierId, request.reference().trim(), ignoredEntryId);
                    if (duplicate)
                        throw new ResponseStatusException(HttpStatus.CONFLICT,
                                "A purchase with this invoice reference already exists for this supplier.");
                }
            }
            case "PAYMENT" -> debit = request.amount();
            case "OPENING" -> {
                boolean duplicate = ignoredEntryId == null
                        ? repository.openingEntryExists(dealerId, supplierId)
                        : repository.openingEntryExistsExcept(dealerId, supplierId, ignoredEntryId);
                if (duplicate)
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "An opening balance has already been recorded for this supplier.");
                if ("PAYABLE".equals(request.openingBalanceSide())) credit = request.amount();
                else if ("ADVANCE".equals(request.openingBalanceSide())) debit = request.amount();
                else throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Choose whether the opening balance is payable or an advance.");
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid ledger entry type.");
        }
        return new EntryAmounts(debit, credit);
    }

    private record EntryAmounts(BigDecimal debit, BigDecimal credit) {}
}
