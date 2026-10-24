package com.example.fertilizer.billing.service;

import com.example.fertilizer.billing.dto.BillingRequest;
import com.example.fertilizer.billing.dto.BillingResponse;
import com.example.fertilizer.billing.repository.BillingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class BillingService {
    private static final Logger log = LoggerFactory.getLogger(BillingService.class);
    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal TWO = new BigDecimal("2");
    private final BillingRepository repository;
    public BillingService(BillingRepository repository) { this.repository = repository; }

    @Transactional(readOnly = true)
    public BillingResponse calculate(BillingRequest request) {
        long dealerId = request.dealerId();
        log.info("Runtime bill calculation started: dealerId={}, itemCount={}", dealerId, request.items().size());
        try {
            BillingResponse.DealerDetails dealer = repository.findActiveDealer(dealerId);
            String destinationState = request.destinationStateCode() == null || request.destinationStateCode().isBlank()
                    ? dealer.stateCode() : request.destinationStateCode().trim();
            boolean interState = !destinationState.equalsIgnoreCase(dealer.stateCode());
            List<BillingResponse.BillLine> lines = new ArrayList<>();
            BigDecimal taxableTotal = BigDecimal.ZERO, cgstTotal = BigDecimal.ZERO,
                    sgstTotal = BigDecimal.ZERO, igstTotal = BigDecimal.ZERO, grandTotal = BigDecimal.ZERO;

            for (BillingRequest.ItemRequest item : request.items()) {
                if (item.bags() == null || item.bags() < 1) throw new IllegalArgumentException("Bags must be at least 1.");
                if (item.priceInclGst() == null || item.priceInclGst().signum() <= 0)
                    throw new IllegalArgumentException("Price including GST must be greater than zero.");
                BillingRepository.ProductPrice product = item.productId() == null
                        ? runtimeProduct(item) : repository.findPricedProduct(dealerId, item.productId());
                BigDecimal gross = item.priceInclGst().multiply(BigDecimal.valueOf(item.bags())).setScale(2, RoundingMode.HALF_UP);
                BigDecimal taxable = gross.multiply(HUNDRED).divide(HUNDRED.add(product.gstRate()), 2, RoundingMode.HALF_UP);
                BigDecimal tax = gross.subtract(taxable).setScale(2, RoundingMode.HALF_UP);
                BigDecimal cgst = interState ? BigDecimal.ZERO.setScale(2) : tax.divide(TWO, 2, RoundingMode.DOWN);
                BigDecimal sgst = interState ? BigDecimal.ZERO.setScale(2) : tax.subtract(cgst).setScale(2, RoundingMode.HALF_UP);
                BigDecimal igst = interState ? tax : BigDecimal.ZERO.setScale(2);
                BigDecimal qty = product.bagSizeKg().multiply(BigDecimal.valueOf(item.bags())).setScale(3, RoundingMode.HALF_UP);
                lines.add(new BillingResponse.BillLine(product.productName(), product.hsnCode(), item.bags(), qty,
                        item.priceInclGst().setScale(2, RoundingMode.HALF_UP), product.gstRate(), taxable, cgst, sgst, igst, gross));
                taxableTotal = taxableTotal.add(taxable); cgstTotal = cgstTotal.add(cgst);
                sgstTotal = sgstTotal.add(sgst); igstTotal = igstTotal.add(igst); grandTotal = grandTotal.add(gross);
            }
            BillingResponse response = new BillingResponse(dealer,
                    "CREDIT".equalsIgnoreCase(request.billType()) ? "Credit Bill" : "Cash / CreditBill",
                    interState ? "IGST" : "CGST_SGST", List.copyOf(lines), taxableTotal.setScale(2, RoundingMode.HALF_UP),
                    cgstTotal.setScale(2, RoundingMode.HALF_UP), sgstTotal.setScale(2, RoundingMode.HALF_UP),
                    igstTotal.setScale(2, RoundingMode.HALF_UP), grandTotal.setScale(2, RoundingMode.HALF_UP), OffsetDateTime.now());
            log.info("Runtime bill calculation completed: dealerId={}, lineCount={}, total={}", dealerId, lines.size(), response.grandTotal());
            return response;
        } catch (IllegalArgumentException ex) {
            log.warn("Bill calculation rejected: dealerId={}, reason={}", dealerId, ex.getMessage());
            throw ex;
        } catch (RuntimeException ex) {
            log.error("Bill calculation failed unexpectedly: dealerId={}", dealerId, ex);
            throw ex;
        }
    }

    private BillingRepository.ProductPrice runtimeProduct(BillingRequest.ItemRequest item) {
        if (item.productName() == null || item.productName().isBlank())
            throw new IllegalArgumentException("Custom product name is required.");
        if (item.bagSizeKg() == null || item.bagSizeKg().signum() <= 0)
            throw new IllegalArgumentException("Custom product bag weight must be greater than zero.");
        if (item.gstRate() == null || item.gstRate().signum() < 0 || item.gstRate().compareTo(HUNDRED) > 0)
            throw new IllegalArgumentException("Custom product GST rate must be between 0 and 100.");
        String hsnCode = item.hsnCode() == null || item.hsnCode().isBlank() ? "—" : item.hsnCode().trim();
        return new BillingRepository.ProductPrice(item.productName().trim(), hsnCode,
                item.bagSizeKg(), item.gstRate(), item.priceInclGst());
    }
}
