package com.example.fertilizer.product;
import com.example.fertilizer.product.dto.ProductDto;
import com.example.fertilizer.product.service.ProductService;
import com.example.fertilizer.auth.AuthRepository;
import jakarta.servlet.http.HttpSession;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "http://localhost:5173", allowCredentials = "true")
public class ProductController {
    private static final Logger log = LoggerFactory.getLogger(ProductController.class);
    private final ProductService productService;
    private final AuthRepository authRepository;
    public ProductController(ProductService productService, AuthRepository authRepository) {
        this.productService = productService;
        this.authRepository = authRepository;
    }
    @GetMapping
    public List<ProductDto> list(@RequestParam(required = false) Long dealerId, HttpSession session) {
        Object sessionUserId = session.getAttribute("userId");
        if (!(sessionUserId instanceof Long userId))
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue.");
        AuthRepository.SessionUser user = authRepository.findActiveSessionUser(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please log in to continue."));
        if (!"ADMIN".equals(user.role()) && !"DEALER".equals(user.role()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Dealer or admin access is required.");
        long scopedDealerId = "ADMIN".equals(user.role()) && dealerId != null ? dealerId : user.dealerId();
        if ("DEALER".equals(user.role()) && dealerId != null && !dealerId.equals(user.dealerId()))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only view your own dealer's products.");
        log.debug("GET /api/products dealerId={}", scopedDealerId);
        return productService.getProducts(scopedDealerId);
    }
}
