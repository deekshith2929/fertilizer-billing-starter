package com.example.fertilizer.product.service;

import com.example.fertilizer.product.dto.ProductCreateRequest;
import com.example.fertilizer.product.dto.ProductManagementDto;
import com.example.fertilizer.product.dto.ProductPriceUpdateRequest;
import com.example.fertilizer.product.dto.ProductUpdateRequest;
import com.example.fertilizer.product.repository.ProductRepository;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ProductManagementService {
    private final ProductRepository repository;

    public ProductManagementService(ProductRepository repository) {
        this.repository = repository;
    }

    @Transactional(readOnly = true)
    public List<ProductManagementDto> getProducts(long dealerId) {
        return repository.findProductsForManagement(dealerId);
    }

    @Transactional(readOnly = true)
    public ProductManagementDto getProduct(long dealerId, long productId) {
        return repository.findProductsForManagement(dealerId).stream()
                .filter(product -> product.id() == productId)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Active product was not found."));
    }

    @Transactional
    public long createProduct(long dealerId, ProductCreateRequest request) {
        if (!dealerIdEquals(request.dealerId(), dealerId))
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "You can only create products for the selected dealer.");
        ProductCreateRequest scopedRequest = new ProductCreateRequest(dealerId, request.productCode(),
                request.productName(), request.brand(), request.hsnCode(), request.bagSizeKg(),
                request.gstRate(), request.defaultPriceInclGst());
        return repository.createProduct(scopedRequest);
    }

    @Transactional
    public void updateProduct(long dealerId, long productId, ProductUpdateRequest request) {
        if (!repository.updateProduct(dealerId, productId, request))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active product was not found.");
    }

    @Transactional
    public void updatePrice(long dealerId, long productId, ProductPriceUpdateRequest request) {
        if (!repository.upsertProductPrice(dealerId, productId, request))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active product was not found.");
    }

    @Transactional
    public void deleteProduct(long dealerId, long productId) {
        if (!repository.deactivateProduct(dealerId, productId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Active product was not found.");
    }

    @Transactional
    public void reactivateProduct(long dealerId, long productId) {
        if (!repository.reactivateProduct(dealerId, productId))
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Inactive product was not found.");
    }

    public boolean dealerExists(long dealerId) {
        return dealerId > 0 && repository.dealerExists(dealerId);
    }

    private boolean dealerIdEquals(Long requestDealerId, long dealerId) {
        return requestDealerId != null && requestDealerId == dealerId;
    }
}
