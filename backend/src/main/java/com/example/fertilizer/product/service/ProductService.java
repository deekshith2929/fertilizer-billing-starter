package com.example.fertilizer.product.service;
import com.example.fertilizer.product.dto.ProductDto;
import com.example.fertilizer.product.repository.ProductRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import java.util.List;
@Service
public class ProductService {
    private static final Logger log = LoggerFactory.getLogger(ProductService.class);
    private final ProductRepository repository;
    public ProductService(ProductRepository repository) { this.repository = repository; }
    public List<ProductDto> getProducts(long dealerId) {
        if (dealerId <= 0) throw new IllegalArgumentException("A valid dealerId is required.");
        List<ProductDto> products = repository.findActiveProducts(dealerId);
        log.info("Loaded {} active products for dealerId={}", products.size(), dealerId);
        return products;
    }
}
