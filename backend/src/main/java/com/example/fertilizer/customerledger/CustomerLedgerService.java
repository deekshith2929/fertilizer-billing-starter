package com.example.fertilizer.customerledger;

import com.example.fertilizer.billing.dto.BillingRequest;
import com.example.fertilizer.billing.dto.BillingResponse;
import com.example.fertilizer.billing.service.BillingService;
import com.example.fertilizer.customerledger.dto.CustomerBillPostRequest;
import com.example.fertilizer.customerledger.dto.CustomerCreateRequest;
import com.example.fertilizer.customerledger.dto.CustomerDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditItemRequest;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditRequest;
import com.example.fertilizer.customerledger.dto.CustomerLedgerEntryDto;
import com.example.fertilizer.customerledger.dto.CustomerLedgerEntryRequest;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class CustomerLedgerService {
    private final CustomerLedgerRepository repository;
    private final BillingService billingService;

    public CustomerLedgerService(CustomerLedgerRepository repository, BillingService billingService) {
        this.repository = repository;
        this.billingService = billingService;
    }

    @Transactional(readOnly = true)
    public boolean dealerExists(long dealerId) {
        return repository.dealerExists(dealerId);
    }

    @Transactional(readOnly = true)
    public List<CustomerDto> getCustomers(long dealerId) {
        return repository.findCustomers(dealerId);
    }

    @Transactional
    public long createCustomer(long dealerId, CustomerCreateRequest request) {
        if (repository.customerNameExists(dealerId, request.customerName().trim()))
            throw new ResponseStatusException(HttpStatus.CONFLICT, "A customer with this name already exists.");
        return repository.createCustomer(dealerId, request);
    }

    @Transactional(readOnly = true)
    public List<CustomerLedgerEntryDto> getEntries(long dealerId, long customerId,
                                                   LocalDate fromDate, LocalDate toDate) {
        requireCustomer(dealerId, customerId);
        if (fromDate != null && toDate != null && toDate.isBefore(fromDate))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "To Date cannot be earlier than From Date.");
        return repository.findEntries(dealerId, customerId, fromDate, toDate);
    }

    @Transactional
    public long createEntry(long dealerId, long customerId, long userId,
                            CustomerLedgerEntryRequest request) {
        requireCustomer(dealerId, customerId);
        BigDecimal debit = BigDecimal.ZERO;
        BigDecimal credit = BigDecimal.ZERO;
        switch (request.entryType()) {
            case "OPENING" -> {
                if (repository.openingEntryExists(dealerId, customerId))
                    throw new ResponseStatusException(HttpStatus.CONFLICT,
                            "An opening balance has already been recorded for this customer.");
                if ("RECEIVABLE".equals(request.balanceSide())) debit = request.amount();
                else if ("ADVANCE".equals(request.balanceSide())) credit = request.amount();
                else throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Choose whether the opening balance is receivable or an advance.");
            }
            case "PAYMENT" -> credit = request.amount();
            case "ADJUSTMENT" -> {
                if ("INCREASE_DUE".equals(request.balanceSide())) debit = request.amount();
                else if ("DECREASE_DUE".equals(request.balanceSide())) credit = request.amount();
                else throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Choose whether the adjustment increases or decreases the amount due.");
            }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid customer ledger entry type.");
        }
        return repository.createLedgerEntry(dealerId, customerId, userId, request.entryType(),
                request.entryDate(), request.reference(), request.notes(), debit, credit);
    }

    @Transactional
    public CustomerInvoiceDto postBill(long dealerId, long customerId, long userId,
                                       CustomerBillPostRequest request) {
        requireCustomer(dealerId, customerId);
        BillingRequest billingRequest = request.bill();
        if (billingRequest.dealerId() == null || billingRequest.dealerId() != dealerId)
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only post a bill for your dealer.");
        if (!"CASH".equalsIgnoreCase(billingRequest.billType())
                && !"CREDIT".equalsIgnoreCase(billingRequest.billType()))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose cash or credit bill type.");
        String destinationState = billingRequest.destinationStateCode();
        if (destinationState != null && !destinationState.isBlank()
                && !destinationState.trim().matches("\\d{2}"))
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Customer state code must contain two digits.");

        BillingResponse calculatedBill = billingService.calculate(billingRequest);
        if (calculatedBill.items().size() != billingRequest.items().size())
            throw new IllegalStateException("Calculated bill lines do not match the submitted bill items.");
        CustomerInvoiceDto created = repository.createInvoice(
                dealerId, customerId, userId, billingRequest, calculatedBill);
        return repository.findInvoice(dealerId, customerId, created.id())
                .orElseThrow(() -> new IllegalStateException("Created customer invoice was not returned."));
    }

    @Transactional(readOnly = true)
    public CustomerInvoiceDto getInvoice(long dealerId, long customerId, long invoiceId) {
        requireCustomer(dealerId, customerId);
        return repository.findInvoice(dealerId, customerId, invoiceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer invoice was not found."));
    }

    @Transactional
    public CustomerInvoiceDto editInvoice(long dealerId, long customerId, long invoiceId, long userId,
                                          CustomerInvoiceEditRequest request) {
        requireCustomer(dealerId, customerId);
        String reason = request.reason().trim();
        if (reason.isEmpty())
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Enter a reason for editing this invoice.");
        CustomerInvoiceDto previous = repository.lockInvoiceForEdit(dealerId, customerId, invoiceId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer invoice was not found."));
        for (CustomerInvoiceEditItemRequest item : request.items()) {
            if (item.productId() != null && !repository.productExists(dealerId, item.productId()))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "An invoice item refers to a product outside this dealer.");
        }
        List<BillingRequest.ItemRequest> calculationItems = request.items().stream()
                .map(CustomerLedgerService::toBillingItem)
                .toList();
        BillingResponse calculatedBill = billingService.calculate(new BillingRequest(
                dealerId, calculationItems, previous.billType(), previous.destinationStateCode()));
        return repository.updateInvoice(
                dealerId, customerId, userId, previous, reason, request.items(), calculatedBill);
    }

    @Transactional(readOnly = true)
    public List<CustomerInvoiceEditDto> getInvoiceEdits(long dealerId, long customerId, long invoiceId) {
        requireCustomer(dealerId, customerId);
        if (repository.findInvoice(dealerId, customerId, invoiceId).isEmpty())
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Customer invoice was not found.");
        return repository.findInvoiceEdits(dealerId, customerId, invoiceId);
    }

    private static BillingRequest.ItemRequest toBillingItem(CustomerInvoiceEditItemRequest item) {
        return new BillingRequest.ItemRequest(null, item.productName(), item.hsnCode(), item.bagSizeKg(),
                item.gstRate(), item.rateInclGst(), item.bags());
    }

    private void requireCustomer(long dealerId, long customerId) {
        if (!repository.customerExists(dealerId, customerId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active customer was not found.");
    }
}
