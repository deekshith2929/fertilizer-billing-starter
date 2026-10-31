package com.example.fertilizer.dealerpricelist;

import com.example.fertilizer.auth.AuthorizationService;
import com.example.fertilizer.dealerpricelist.PriceListDtos.AuditDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.CompanyDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.HistoryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportSummaryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.PriceDto;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.util.List;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/dealer-price-lists")
@CrossOrigin(origins = "${FRONTEND_ORIGIN:http://localhost:5173}", allowCredentials = "true")
public class DealerPriceListController {
    private final AuthorizationService authorizationService;
    private final DealerPriceListService service;

    public DealerPriceListController(AuthorizationService authorizationService,
                                     DealerPriceListService service) {
        this.authorizationService = authorizationService;
        this.service = service;
    }

    @GetMapping("/template")
    public ResponseEntity<byte[]> template(HttpSession session) throws IOException {
        requireDealer(session, "DEALER_PRICE_LIST_VIEW");
        try (XSSFWorkbook workbook = service.createTemplate();
             ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            workbook.write(output);
            return ResponseEntity.ok()
                    .contentType(MediaType.parseMediaType(
                            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                    .header(HttpHeaders.CONTENT_DISPOSITION,
                            ContentDisposition.attachment().filename("dealer-price-list-template.xlsx").build().toString())
                    .body(output.toByteArray());
        }
    }

    @GetMapping(value = "/prompt", produces = MediaType.TEXT_PLAIN_VALUE)
    public String prompt(HttpSession session) {
        requireDealer(session, "DEALER_PRICE_LIST_VIEW");
        return service.prompt();
    }

    @GetMapping("/companies")
    public List<CompanyDto> companies(HttpSession session) {
        return service.companies(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId());
    }

    @GetMapping("/technical-names")
    public List<String> technicalNames(HttpSession session) {
        return service.technicalNames(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId());
    }

    @GetMapping("/imports")
    public List<ImportSummaryDto> imports(HttpSession session) {
        return service.imports(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId());
    }

    @PostMapping(value = "/imports", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<ImportDto> importFile(@RequestPart("file") MultipartFile file,
                                                HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        ImportDto created = service.importFile(user.dealerId(), user.id(), file);
        return ResponseEntity.created(URI.create("/api/dealer-price-lists/imports/" + created.id()))
                .body(created);
    }

    @GetMapping("/imports/{importId}")
    public ImportDto getImport(@PathVariable long importId, HttpSession session) {
        return service.getImport(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId(), importId);
    }

    @PutMapping("/imports/{importId}/items/{itemId}")
    public ImportDto updateDraftItem(@PathVariable long importId, @PathVariable long itemId,
                                     @Valid @RequestBody PriceListItemUpdateRequest request,
                                     HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        return service.updateDraftItem(user.dealerId(), importId, itemId, request);
    }

    @PostMapping("/imports/{importId}/items/exclude")
    public ImportDto excludeDraftItems(@PathVariable long importId,
                                       @Valid @RequestBody PriceListBulkExcludeRequest request,
                                       HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        return service.excludeDraftItems(user.dealerId(), importId, request.itemIds());
    }

    @PostMapping("/imports/{importId}/confirm")
    public ImportDto confirmImport(@PathVariable long importId,
                                   @Valid @RequestBody PriceListConfirmRequest request,
                                   HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        return service.confirmImport(user.dealerId(), user.id(), importId, request.makeCurrent());
    }

    @PostMapping("/imports/{importId}/cancel")
    public ImportSummaryDto cancelImport(@PathVariable long importId, HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        return service.cancelImport(user.dealerId(), importId);
    }

    @GetMapping("/items")
    public List<PriceDto> search(@RequestParam(required = false) String search, HttpSession session) {
        return service.search(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId(), search);
    }

    @PostMapping("/items")
    public ResponseEntity<ImportDto> addManualPrice(
            @Valid @RequestBody PriceListManualAddRequest request, HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        ImportDto created = service.addManualPrice(user.dealerId(), user.id(), request);
        return ResponseEntity.created(URI.create("/api/dealer-price-lists/imports/" + created.id()))
                .body(created);
    }

    @GetMapping("/items/{itemId}/history")
    public List<HistoryDto> history(@PathVariable long itemId, HttpSession session) {
        return service.history(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId(), itemId);
    }

    @PostMapping("/items/{itemId}/revisions")
    public List<HistoryDto> revise(@PathVariable long itemId,
                                   @Valid @RequestBody PriceListItemUpdateRequest request,
                                   HttpSession session) {
        var user = requireDealer(session, "DEALER_PRICE_LIST_MANAGE");
        return service.reviseCurrentItem(user.dealerId(), user.id(), itemId, request);
    }

    @GetMapping("/audit")
    public List<AuditDto> audit(HttpSession session) {
        return service.audit(requireDealer(session, "DEALER_PRICE_LIST_VIEW").dealerId());
    }

    private com.example.fertilizer.auth.AuthRepository.SessionUser requireDealer(
            HttpSession session, String permission) {
        var user = authorizationService.requirePermission(session, permission);
        if (!"DEALER".equals(user.role()) || user.dealerId() == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "Dealer price lists are available only to assigned dealer users.");
        }
        return user;
    }
}
