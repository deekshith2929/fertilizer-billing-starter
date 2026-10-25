package com.example.fertilizer.companyledger;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.auth.AuthRepository.SessionUser;
import com.example.fertilizer.companyledger.dto.SupplierCreateRequest;
import com.example.fertilizer.companyledger.dto.SupplierDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryEditDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryDto;
import com.example.fertilizer.companyledger.dto.SupplierLedgerEntryRequest;
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
@RequestMapping("/api/company-ledger")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class SupplierLedgerController {
    private final AuthorizationService authorizationService;
    private final SupplierLedgerService supplierLedgerService;

    public SupplierLedgerController(AuthorizationService authorizationService, SupplierLedgerService supplierLedgerService) {
        this.authorizationService = authorizationService;
        this.supplierLedgerService = supplierLedgerService;
    }

    @GetMapping("/suppliers")
    public List<SupplierDto> suppliers(@RequestParam(required = false) Long dealerId, HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return supplierLedgerService.getSuppliers(scopedDealerId);
    }

    @PostMapping("/suppliers")
    public ResponseEntity<SupplierDto> createSupplier(@RequestParam(required = false) Long dealerId,
                                                       @Valid @RequestBody SupplierCreateRequest request,
                                                       HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        long supplierId = supplierLedgerService.createSupplier(scopedDealerId, request);
        SupplierDto created = supplierLedgerService.getSuppliers(scopedDealerId).stream()
                .filter(supplier -> supplier.id() == supplierId)
                .findFirst()
                .orElseThrow(() -> new IllegalStateException("Created supplier was not returned."));
        return ResponseEntity.created(URI.create("/api/company-ledger/suppliers/" + supplierId)).body(created);
    }

    @GetMapping("/suppliers/{supplierId}/entries")
    public List<SupplierLedgerEntryDto> entries(@PathVariable long supplierId,
                                                @RequestParam(required = false) LocalDate fromDate,
                                                @RequestParam(required = false) LocalDate toDate,
                                                @RequestParam(required = false) Long dealerId,
                                                HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return supplierLedgerService.getEntries(scopedDealerId, supplierId, fromDate, toDate);
    }

    @PostMapping("/suppliers/{supplierId}/entries")
    public ResponseEntity<Long> createEntry(@PathVariable long supplierId,
                                            @RequestParam(required = false) Long dealerId,
                                            @Valid @RequestBody SupplierLedgerEntryRequest request,
                                            HttpSession session) {
        SessionUser user = activeUser(session);
        long scopedDealerId = resolveDealerId(user, dealerId);
        long entryId = supplierLedgerService.createEntry(scopedDealerId, supplierId, user.id(), request);
        return ResponseEntity.created(URI.create(
                "/api/company-ledger/suppliers/" + supplierId + "/entries/" + entryId)).body(entryId);
    }

    @PutMapping("/suppliers/{supplierId}/entries/{entryId}")
    public ResponseEntity<Boolean> updateEntry(@PathVariable long supplierId, @PathVariable long entryId,
                                               @RequestParam(required = false) Long dealerId,
                                               @Valid @RequestBody SupplierLedgerEntryRequest request,
                                               HttpSession session) {
        SessionUser user = activeUser(session);
        long scopedDealerId = resolveDealerId(user, dealerId);
        boolean changed = supplierLedgerService.updateEntry(scopedDealerId, supplierId, entryId, user.id(), request);
        return ResponseEntity.ok(changed);
    }

    @GetMapping("/suppliers/{supplierId}/entries/{entryId}/history")
    public List<SupplierLedgerEntryEditDto> entryHistory(@PathVariable long supplierId,
                                                         @PathVariable long entryId,
                                                         @RequestParam(required = false) Long dealerId,
                                                         HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return supplierLedgerService.getEntryEdits(scopedDealerId, supplierId, entryId);
    }

    private long resolveDealerId(HttpSession session, Long requestedDealerId) {
        SessionUser user = authorizationService.requirePermission(session, "COMPANY_LEDGER_VIEW");
        return authorizationService.resolveDealerId(user, requestedDealerId);
    }

    private long resolveDealerId(SessionUser user, Long requestedDealerId) {
        if (!user.hasPermission("COMPANY_LEDGER_VIEW"))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Company ledger access is required.");
        return authorizationService.resolveDealerId(user, requestedDealerId);
    }

    private SessionUser activeUser(HttpSession session) {
        return authorizationService.requirePermission(session, "COMPANY_LEDGER_VIEW");
    }
}
