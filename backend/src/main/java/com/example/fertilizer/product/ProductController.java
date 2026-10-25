package com.example.fertilizer.product;
import com.example.fertilizer.product.dto.ProductDto;
import com.example.fertilizer.product.service.ProductService;
import com.example.fertilizer.auth.AuthorizationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.bind.annotation.*;
import java.util.List;
@RestController
@RequestMapping("/api/products")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class ProductController {
    private static final Logger log = LoggerFactory.getLogger(ProductController.class);
    private final ProductService productService;
    private final AuthorizationService authorizationService;
    public ProductController(ProductService productService, AuthorizationService authorizationService) {
        this.productService = productService;
        this.authorizationService = authorizationService;
    }
    @GetMapping
    public List<ProductDto> list(@RequestParam(required = false) Long dealerId,
                                 jakarta.servlet.http.HttpSession session) {
        var user = authorizationService.requirePermission(session, "PRODUCT_VIEW");
        long scopedDealerId = authorizationService.resolveDealerId(user, dealerId);
        log.debug("GET /api/products dealerId={}", scopedDealerId);
        return productService.getProducts(scopedDealerId);
    }
}
