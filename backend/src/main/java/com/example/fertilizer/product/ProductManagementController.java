package com.example.fertilizer.product;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.product.dto.ProductCreateRequest;
import com.example.fertilizer.product.dto.ProductManagementDto;
import com.example.fertilizer.product.dto.ProductPriceUpdateRequest;
import com.example.fertilizer.product.dto.ProductUpdateRequest;
import com.example.fertilizer.product.service.ProductManagementService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/product-management")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class ProductManagementController {
    private final AuthorizationService authorizationService;
    private final ProductManagementService productManagementService;

    public ProductManagementController(AuthorizationService authorizationService,
                                       ProductManagementService productManagementService) {
        this.authorizationService = authorizationService;
        this.productManagementService = productManagementService;
    }

    @GetMapping("/products")
    public List<ProductManagementDto> list(@RequestParam(required = false) Long dealerId,
                                          HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        return productManagementService.getProducts(scopedDealerId);
    }

    @PostMapping("/products")
    public ResponseEntity<ProductManagementDto> create(@Valid @RequestBody ProductCreateRequest request,
                                                        HttpSession session) {
        var user = authorizationService.requirePermission(session, "PRODUCT_MANAGE");
        authorizationService.requirePermission(session, "DEALER_PRICE_MANAGE");
        long scopedDealerId = authorizationService.resolveDealerId(user, request.dealerId());
        long productId = productManagementService.createProduct(scopedDealerId, request);
        ProductManagementDto created = productManagementService.getProduct(scopedDealerId, productId);
        return ResponseEntity.created(URI.create("/api/product-management/products/" + productId))
                .body(created);
    }

    @PutMapping("/products/{productId}")
    public ProductManagementDto update(@PathVariable long productId,
                                       @Valid @RequestBody ProductUpdateRequest request,
                                       @RequestParam(required = false) Long dealerId,
                                       HttpSession session) {
        var user = authorizationService.requirePermission(session, "PRODUCT_MANAGE");
        long scopedDealerId = authorizationService.resolveDealerId(user, dealerId);
        if (!user.hasPermission("DEALER_PRICE_MANAGE")) {
            var existing = productManagementService.getProduct(scopedDealerId, productId);
            if (existing.defaultPriceInclGst() == null
                    || request.defaultPriceInclGst().compareTo(existing.defaultPriceInclGst()) != 0)
                authorizationService.requirePermission(session, "DEALER_PRICE_MANAGE");
        }
        productManagementService.updateProduct(scopedDealerId, productId, request);
        return productManagementService.getProduct(scopedDealerId, productId);
    }

    @PutMapping("/products/{productId}/price")
    public ProductManagementDto updatePrice(@PathVariable long productId,
                                            @Valid @RequestBody ProductPriceUpdateRequest request,
                                            @RequestParam(required = false) Long dealerId,
                                            HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId, "DEALER_PRICE_MANAGE");
        productManagementService.updatePrice(scopedDealerId, productId, request);
        return productManagementService.getProduct(scopedDealerId, productId);
    }

    @DeleteMapping("/products/{productId}")
    public ResponseEntity<Void> delete(@PathVariable long productId,
                                       @RequestParam(required = false) Long dealerId,
                                       HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        productManagementService.deleteProduct(scopedDealerId, productId);
        return ResponseEntity.noContent().build();
    }

    @PutMapping("/products/{productId}/restore")
    public ResponseEntity<Void> restore(@PathVariable long productId,
                                        @RequestParam(required = false) Long dealerId,
                                        HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
        productManagementService.reactivateProduct(scopedDealerId, productId);
        return ResponseEntity.noContent().build();
    }

    private long resolveDealerId(HttpSession session, Long requestedDealerId) {
        return resolveDealerId(session, requestedDealerId, "PRODUCT_MANAGE");
    }

    private long resolveDealerId(HttpSession session, Long requestedDealerId, String permission) {
        var user = authorizationService.requirePermission(session, permission);
        return authorizationService.resolveDealerId(user, requestedDealerId);
    }
}
