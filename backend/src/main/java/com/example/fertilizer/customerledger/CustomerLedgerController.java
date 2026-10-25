package com.example.fertilizer.customerledger;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.auth.AuthRepository.SessionUser;
import com.example.fertilizer.customerledger.dto.CustomerBillPostRequest;
import com.example.fertilizer.customerledger.dto.CustomerCreateRequest;
import com.example.fertilizer.customerledger.dto.CustomerDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditDto;
import com.example.fertilizer.customerledger.dto.CustomerInvoiceEditRequest;
import com.example.fertilizer.customerledger.dto.CustomerLedgerEntryDto;
import com.example.fertilizer.customerledger.dto.CustomerLedgerEntryRequest;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.net.URI;
import java.time.LocalDate;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/customer-ledger")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class CustomerLedgerController {
    private final AuthorizationService authorizationService;
    private final CustomerLedgerService service;

    public CustomerLedgerController(AuthorizationService authorizationService, CustomerLedgerService service) {
        this.authorizationService = authorizationService;
        this.service = service;
    }

    @GetMapping("/customers")
    public List<CustomerDto> customers(@RequestParam(required = false) Long dealerId, HttpSession session) {
        return service.getCustomers(resolveDealerId(session, dealerId));
    }

    @PostMapping("/customers")
    public ResponseEntity<CustomerDto> createCustomer(@RequestParam(required = false) Long dealerId,
                                                       @Valid @RequestBody CustomerCreateRequest request,
                                                       HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        long customerId = service.createCustomer(scopedDealerId, request);
        CustomerDto created = service.getCustomers(scopedDealerId).stream()
                .filter(customer -> customer.id() == customerId)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Created customer was not returned."));
        return ResponseEntity.created(URI.create("/api/customer-ledger/customers/" + customerId)).body(created);
    }

    @GetMapping("/customers/{customerId}/entries")
    public List<CustomerLedgerEntryDto> entries(@PathVariable long customerId,
                                                @RequestParam(required = false) LocalDate fromDate,
                                                @RequestParam(required = false) LocalDate toDate,
                                                @RequestParam(required = false) Long dealerId,
                                                HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return service.getEntries(scopedDealerId, customerId, fromDate, toDate);
    }

    @PostMapping("/customers/{customerId}/entries")
    public ResponseEntity<Long> createEntry(@PathVariable long customerId,
                                            @RequestParam(required = false) Long dealerId,
                                            @Valid @RequestBody CustomerLedgerEntryRequest request,
                                            HttpSession session) {
        SessionUser user = activeUser(session);
        long scopedDealerId = resolveDealerId(user, dealerId);
        long entryId = service.createEntry(scopedDealerId, customerId, user.id(), request);
        return ResponseEntity.created(URI.create(
                "/api/customer-ledger/customers/" + customerId + "/entries/" + entryId)).body(entryId);
    }

    @PostMapping("/bills")
    public ResponseEntity<CustomerInvoiceDto> postBill(@Valid @RequestBody CustomerBillPostRequest request,
                                                       HttpSession session) {
        SessionUser user = authorizationService.requirePermission(session, "BILLING_USE");
        if (!user.hasPermission("CUSTOMER_LEDGER_VIEW"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer ledger access is required.");
        long scopedDealerId = resolveDealerId(user, request.bill().dealerId());
        CustomerInvoiceDto invoice = service.postBill(scopedDealerId, request.customerId(), user.id(), request);
        return ResponseEntity.created(URI.create(
                "/api/customer-ledger/customers/" + request.customerId() + "/invoices/" + invoice.id())
                ).body(invoice);
    }

    @GetMapping("/customers/{customerId}/invoices/{invoiceId}")
    public CustomerInvoiceDto invoice(@PathVariable long customerId, @PathVariable long invoiceId,
                                      @RequestParam(required = false) Long dealerId, HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return service.getInvoice(scopedDealerId, customerId, invoiceId);
    }

    @PutMapping("/customers/{customerId}/invoices/{invoiceId}")
    public CustomerInvoiceDto editInvoice(@PathVariable long customerId, @PathVariable long invoiceId,
                                          @RequestParam(required = false) Long dealerId,
                                          @Valid @RequestBody CustomerInvoiceEditRequest request,
                                          HttpSession session) {
        SessionUser user = activeUser(session);
        long scopedDealerId = resolveDealerId(user, dealerId);
        return service.editInvoice(scopedDealerId, customerId, invoiceId, user.id(), request);
    }

    @GetMapping("/customers/{customerId}/invoices/{invoiceId}/edits")
    public List<CustomerInvoiceEditDto> invoiceEdits(@PathVariable long customerId, @PathVariable long invoiceId,
                                                      @RequestParam(required = false) Long dealerId,
                                                      HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return service.getInvoiceEdits(scopedDealerId, customerId, invoiceId);
    }

    private long resolveDealerId(HttpSession session, Long requestedDealerId) {
        SessionUser user = authorizationService.requirePermission(session, "CUSTOMER_LEDGER_VIEW");
        return authorizationService.resolveDealerId(user, requestedDealerId);
    }

    private long resolveDealerId(SessionUser user, Long requestedDealerId) {
        if (!user.hasPermission("CUSTOMER_LEDGER_VIEW"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Customer ledger access is required.");
        return authorizationService.resolveDealerId(user, requestedDealerId);
    }

    private SessionUser activeUser(HttpSession session) {
        return authorizationService.requirePermission(session, "CUSTOMER_LEDGER_VIEW");
    }
}
