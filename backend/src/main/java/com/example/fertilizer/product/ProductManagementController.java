package com.example.fertilizer.product;

import com.example.fertilizer.auth.AuthRepository;
import com.example.fertilizer.product.dto.ProductCreateRequest;
import com.example.fertilizer.product.dto.ProductManagementDto;
import com.example.fertilizer.product.dto.ProductPriceUpdateRequest;
import com.example.fertilizer.product.dto.ProductUpdateRequest;
import com.example.fertilizer.product.service.ProductManagementService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.net.URI;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/product-management")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class ProductManagementController {
    private final AuthRepository authRepository;
    private final ProductManagementService productManagementService;

    public ProductManagementController(AuthRepository authRepository,
                                       ProductManagementService productManagementService) {
        this.authRepository = authRepository;
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
        long scopedDealerId = resolveDealerId(session, request.dealerId());
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
        long scopedDealerId = resolveDealerId(session, dealerId);
        productManagementService.updateProduct(scopedDealerId, productId, request);
        return productManagementService.getProduct(scopedDealerId, productId);
    }

    @PutMapping("/products/{productId}/price")
    public ProductManagementDto updatePrice(@PathVariable long productId,
                                            @Valid @RequestBody ProductPriceUpdateRequest request,
                                            @RequestParam(required = false) Long dealerId,
                                            HttpSession session) {
        long scopedDealerId = resolveDealerId(session, dealerId);
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
        Object sessionUserId = session.getAttribute("userId");
        if (!(sessionUserId instanceof Long userId))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue.");
        AuthRepository.SessionUser user = authRepository.findActiveSessionUser(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
        if ("ADMIN".equals(user.role())) {
            long dealerId = requestedDealerId == null ? user.dealerId() : requestedDealerId;
            if (!productManagementService.dealerExists(dealerId))
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Select an active dealer.");
            return dealerId;
        }
        if (!"DEALER".equals(user.role()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dealer or admin access is required.");
        if (requestedDealerId != null && !requestedDealerId.equals(user.dealerId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only manage your own dealer's products.");
        return user.dealerId();
    }
}
