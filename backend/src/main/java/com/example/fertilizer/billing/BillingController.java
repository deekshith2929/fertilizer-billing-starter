package com.example.fertilizer.billing;

import com.example.fertilizer.billing.dto.BillingRequest;
import com.example.fertilizer.billing.dto.BillingResponse;
import com.example.fertilizer.billing.service.BillingService;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/billing")
@CrossOrigin(origins = "http://localhost:5173")
public class BillingController {
    private static final Logger log = LoggerFactory.getLogger(BillingController.class);
    private final BillingService billingService;
    public BillingController(BillingService billingService) { this.billingService = billingService; }

    @PostMapping("/calculate")
    public BillingResponse calculate(@Valid @RequestBody BillingRequest request) {
        log.debug("POST /api/billing/calculate received for dealerId={}", request.dealerId());
        return billingService.calculate(request);
    }
}
