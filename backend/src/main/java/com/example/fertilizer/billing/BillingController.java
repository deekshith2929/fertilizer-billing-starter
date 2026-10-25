package com.example.fertilizer.billing;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.billing.dto.BillingRequest;
import com.example.fertilizer.billing.dto.BillingResponse;
import com.example.fertilizer.billing.service.BillingService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/billing")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class BillingController {
    private static final Logger log = LoggerFactory.getLogger(BillingController.class);
    private final BillingService billingService;
    private final AuthorizationService authorizationService;
    public BillingController(BillingService billingService, AuthorizationService authorizationService) {
        this.billingService = billingService;
        this.authorizationService = authorizationService;
    }

    @PostMapping("/calculate")
    public BillingResponse calculate(@Valid @RequestBody BillingRequest request, HttpSession session) {
        var user = authorizationService.requirePermission(session, "BILLING_USE");
        if (request.dealerId() == null || !request.dealerId().equals(user.dealerId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only calculate bills for your dealer.");
        log.debug("POST /api/billing/calculate received for dealerId={}", request.dealerId());
        return billingService.calculate(request);
    }
}
