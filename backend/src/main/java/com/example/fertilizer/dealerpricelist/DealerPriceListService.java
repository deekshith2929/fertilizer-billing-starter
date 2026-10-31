package com.example.fertilizer.dealerpricelist;

import com.example.fertilizer.dealerpricelist.DealerPriceListRepository.StoredItem;
import com.example.fertilizer.dealerpricelist.PriceListDtos.AuditDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.CompanyDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.HistoryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ImportSummaryDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.ItemCommentsDto;
import com.example.fertilizer.dealerpricelist.PriceListDtos.PriceDto;
import java.io.IOException;
import java.math.BigDecimal;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.apache.poi.ss.usermodel.BorderStyle;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.FillPatternType;
import org.apache.poi.ss.usermodel.IndexedColors;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@Service
public class DealerPriceListService {
    private static final BigDecimal GST_TOLERANCE = new BigDecimal("0.02");
    private final DealerPriceListRepository repository;
    private final PriceListFileParser parser;

    public DealerPriceListService(DealerPriceListRepository repository, PriceListFileParser parser) {
        this.repository = repository;
        this.parser = parser;
    }

    public XSSFWorkbook createTemplate() {
        XSSFWorkbook workbook = new XSSFWorkbook();
        var sheet = workbook.createSheet("Price List");
        var header = sheet.createRow(0);
        CellStyle headerStyle = workbook.createCellStyle();
        headerStyle.setFillForegroundColor(IndexedColors.DARK_GREEN.getIndex());
        headerStyle.setFillPattern(FillPatternType.SOLID_FOREGROUND);
        headerStyle.setBorderBottom(BorderStyle.THIN);
        var font = workbook.createFont();
        font.setBold(true);
        font.setColor(IndexedColors.WHITE.getIndex());
        headerStyle.setFont(font);
        List<String> headers = PriceListFileParser.headers();
        for (int column = 0; column < headers.size(); column++) {
            var cell = header.createCell(column);
            cell.setCellValue(headers.get(column));
            cell.setCellStyle(headerStyle);
            sheet.setColumnWidth(column, Math.min(12000, Math.max(3200, headers.get(column).length() * 320)));
        }
        sheet.createFreezePane(0, 1);
        sheet.setAutoFilter(new org.apache.poi.ss.util.CellRangeAddress(0, 0, 0, headers.size() - 1));
        var instructions = workbook.createSheet("Instructions");
        String[] notes = {
                "Enter one row per product and selling unit.",
                "Prices must be for the selling unit listed in Unit Size and Unit.",
                "Do not enter a per-Kg/Ltr rate as a unit price unless the selling unit is exactly 1 Kg/Ltr.",
                "Keep dealer price, cash price, and MRP in their separate columns.",
                "Enter Company Name consistently on every product row.",
                "Use an ISO date (YYYY-MM-DD) for Price List Effective Date when available.",
                "Leave unclear values blank and explain the issue in Comments; do not guess.",
                "Source Page/Row is optional and helps verify the extracted entry."
        };
        for (int index = 0; index < notes.length; index++) {
            instructions.createRow(index).createCell(0).setCellValue(notes[index]);
        }
        instructions.setColumnWidth(0, 16000);
        return workbook;
    }

    public String prompt() {
        return """
                Convert the attached supplier price list into the provided Excel template.
                Create one row for each distinct product and selling unit. Use the template columns
                exactly and enter the company name and price-list effective date on every product row.
                Copy trade name, technical name/formulation, unit size and unit as shown.
                Enter Price Ex-GST per Unit, GST %, Price Incl-GST per Unit, and MRP per Unit
                separately. Prices must refer to the listed selling unit; do not confuse a per-Kg/Ltr
                rate with a 500 ml bottle or other smaller unit price. Do not substitute MRP for the
                dealer price, cash price, or another price basis. Do not guess missing or unclear data:
                leave it blank and explain in Comments. Include the source PDF page or spreadsheet
                row when possible. Check whether Price Incl-GST per Unit equals Price Ex-GST per Unit
                multiplied by (1 + GST % / 100). If it does not, explain the discrepancy in Comments
                and preserve the source values without silently correcting them. Return the completed
                file using the provided template.
                """;
    }

    @Transactional
    public ImportDto importFile(long dealerId, long userId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("Select a completed .xlsx, .xls, or .csv price-list file.");
        }
        String sourceFileName = file.getOriginalFilename();
        if (sourceFileName == null || sourceFileName.isBlank()) {
            throw new IllegalArgumentException("The uploaded file does not have a filename.");
        }
        sourceFileName = sourceFileName.replace('\\', '/');
        sourceFileName = sourceFileName.substring(sourceFileName.lastIndexOf('/') + 1);
        if (sourceFileName.length() > 255) sourceFileName = sourceFileName.substring(0, 255);
        try {
            byte[] content = file.getBytes();
            PriceListFileParser.ParsedFile parsed = parser.parse(content, sourceFileName);
            String hash = sha256(content);
            if (repository.hasFileHash(dealerId, hash)) {
                throw new ResponseStatusException(HttpStatus.CONFLICT,
                        "This file has already been imported for your dealership.");
            }
            String normalizedCompany = normalizeText(parsed.companyName());
            var created = repository.createImport(dealerId, userId, parsed.companyName(),
                    normalizedCompany, parsed.effectiveDate(), parsed.effectivePeriodText(),
                    sourceFileName, hash);
            for (PriceListFileParser.ParsedItem item : parsed.items()) {
                repository.insertItem(dealerId, created.importId(), created.companyId(), item);
            }
            return repository.findImport(dealerId, created.importId())
                    .orElseThrow(() -> new IllegalStateException("Created price-list import was not returned."));
        } catch (IOException ex) {
            throw new IllegalArgumentException("Could not read the uploaded price-list file.", ex);
        }
    }

    public List<ImportSummaryDto> imports(long dealerId) {
        return repository.findImports(dealerId);
    }

    public ImportDto getImport(long dealerId, long importId) {
        return repository.findImport(dealerId, importId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Price-list import was not found."));
    }

    @Transactional
    public ImportDto addManualPrice(long dealerId, long userId, PriceListManualAddRequest request) {
        String companyName = request.companyName().trim();
        String normalizedCompany = normalizeText(companyName);
        if (normalizedCompany.isBlank()) {
            throw new IllegalArgumentException("Enter a valid company name.");
        }
        PriceListItemUpdateRequest item = request.item();
        String trade = normalizeText(item.tradeName());
        String technical = normalizeText(item.technicalName());
        List<String> validationNotes = validateItem(item, trade, technical);
        if (!validationNotes.isEmpty()) {
            throw new IllegalArgumentException("Correct the product and price fields before adding: "
                    + String.join(" ", validationNotes));
        }

        UnitMatch unitMatch = normalizeUnit(item.unit(), item.unitSize());
        long companyId = repository.findOrCreateCompany(dealerId, companyName, normalizedCompany);
        long listId = repository.createManualEditList(dealerId, userId, companyId,
                request.effectiveDate(), null);
        PriceListFileParser.ParsedItem parsedItem = new PriceListFileParser.ParsedItem(
                blankToNull(item.tradeName()), blankToNull(item.technicalName()), trade, technical,
                item.unitSize(), unitMatch.unit(), unitMatch.size(), unitMatch.matchUnit(),
                item.priceExGstPerUnit(), item.gstPercent(), item.priceInclGstPerUnit(),
                item.mrpPerUnit(), blankToNull(item.category()), blankToNull(item.comments()),
                blankToNull(item.sourceReference()), "READY", null);
        long newItemId = repository.insertItem(dealerId, listId, companyId, parsedItem);
        StoredItem previous = repository.findCurrentMatch(dealerId, companyId, technical, trade,
                unitMatch.size(), unitMatch.matchUnit()).orElse(null);
        if (previous != null) repository.setCurrent(dealerId, previous.id(), false);
        repository.setCurrent(dealerId, newItemId, true);
        StoredItem current = repository.findItem(dealerId, newItemId)
                .orElseThrow(() -> new IllegalStateException("Added price was not returned."));
        if (previous != null) {
            if (item.reason() == null || item.reason().isBlank()) {
                throw new IllegalArgumentException("Enter a reason for replacing the current price.");
            }
            repository.recordAudit(dealerId, listId, previous.id(), newItemId,
                    auditEvent(previous, current), changedFields(previous, current),
                    item.reason().trim(), userId);
        }
        return getImport(dealerId, listId);
    }

    @Transactional
    public ImportDto updateDraftItem(long dealerId, long importId, long itemId,
                                     PriceListItemUpdateRequest request) {
        if (!repository.importIsReview(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only rows in an import awaiting review can be edited here.");
        }
        String trade = normalizeText(request.tradeName());
        String technical = normalizeText(request.technicalName());
        UnitMatch unitMatch = normalizeUnit(request.unit(), request.unitSize());
        List<String> validationNotes = validateItem(request, trade, technical);
        String requestedStatus = request.reviewStatus().trim().toUpperCase(Locale.ROOT);
        if (!requestedStatus.equals("READY") && !requestedStatus.equals("NEEDS_REVIEW")
                && !requestedStatus.equals("EXCLUDED")) {
            throw new IllegalArgumentException("Review status must be READY or EXCLUDED.");
        }
        String status = requestedStatus.equals("EXCLUDED") ? "EXCLUDED"
                : validationNotes.isEmpty() ? "READY" : "NEEDS_REVIEW";
        String notes = status.equals("EXCLUDED") ? "Excluded by dealer."
                : String.join(" ", validationNotes);
        repository.updateDraftItem(dealerId, importId, itemId, request, trade, technical,
                unitMatch.unit(), unitMatch.size(), unitMatch.matchUnit(),
                status, notes.isBlank() ? null : notes);
        return getImport(dealerId, importId);
    }

    @Transactional
    public ImportDto excludeDraftItems(long dealerId, long importId, List<Long> itemIds) {
        if (!repository.importIsReview(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only rows in an import awaiting review can be excluded.");
        }
        validateBulkItemIds(itemIds);
        if (repository.excludeDraftItems(dealerId, importId, itemIds) != itemIds.size()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Some selected rows are no longer available to exclude. Refresh the report and try again.");
        }
        return getImport(dealerId, importId);
    }

    @Transactional
    public ImportDto includeDraftItems(long dealerId, long importId, List<Long> itemIds) {
        if (!repository.importIsReview(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only rows in an import awaiting review can be included.");
        }
        validateBulkItemIds(itemIds);
        if (repository.includeDraftItems(dealerId, importId, itemIds) != itemIds.size()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Some selected rows are no longer awaiting inclusion. Refresh the report and try again.");
        }
        return getImport(dealerId, importId);
    }

    private void validateBulkItemIds(List<Long> itemIds) {
        if (itemIds == null || itemIds.isEmpty() || itemIds.size() > 5000) {
            throw new IllegalArgumentException("Select between 1 and 5000 rows.");
        }
        if (itemIds.stream().anyMatch(java.util.Objects::isNull)
                || itemIds.stream().distinct().count() != itemIds.size()) {
            throw new IllegalArgumentException("Selected row IDs must be unique and valid.");
        }
    }

    @Transactional
    public ImportDto confirmImport(long dealerId, long userId, long importId, boolean makeCurrent) {
        if (!repository.importIsReview(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "This price-list import is not awaiting review.");
        }
        if (repository.hasUnreviewedImportItems(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Resolve or exclude every row that needs review before confirming this import.");
        }
        List<StoredItem> items = repository.findReadyItems(dealerId, importId);
        if (items.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Include at least one valid product row before confirming this import.");
        }
        List<String> duplicateKeys = duplicateKeys(items);
        if (!duplicateKeys.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "The review contains duplicate product/unit rows. Correct or exclude duplicates first.");
        }
        for (StoredItem item : items) {
            var previous = repository.findCurrentMatch(dealerId, item.companyId(),
                    item.normalizedTechnicalName(), item.normalizedTradeName(),
                    item.matchUnitSize(), item.matchUnit());
            if (makeCurrent && previous.isPresent()) repository.setCurrent(dealerId, previous.get().id(), false);
            if (makeCurrent) repository.setCurrent(dealerId, item.id(), true);
            if (makeCurrent && previous.isPresent()) {
                StoredItem previousItem = previous.get();
                repository.recordAudit(dealerId, importId, previousItem.id(),
                        item.id(), auditEvent(previousItem, item),
                        changedFields(previousItem, item), null, userId);
            }
        }
        repository.confirmImport(dealerId, importId, userId);
        return getImport(dealerId, importId);
    }

    @Transactional
    public ImportSummaryDto cancelImport(long dealerId, long importId) {
        if (!repository.importIsReview(dealerId, importId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only an import awaiting review can be cancelled.");
        }
        repository.cancelImport(dealerId, importId);
        return repository.findImports(dealerId).stream().filter(item -> item.id() == importId)
                .findFirst().orElseThrow(() -> new IllegalStateException("Cancelled import was not returned."));
    }

    public List<PriceDto> search(long dealerId, String search, Long companyId) {
        String normalized = search == null || search.isBlank() ? null : normalizeText(search);
        if (normalized != null && normalized.isBlank()) normalized = null;
        return normalized == null && companyId == null
                ? List.of() : repository.searchCurrent(dealerId, normalized, companyId);
    }

    public List<HistoryDto> history(long dealerId, long itemId) {
        StoredItem item = repository.findItem(dealerId, itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Price-list item was not found."));
        return repository.findHistory(dealerId, item);
    }

    public ItemCommentsDto comments(long dealerId, long itemId) {
        StoredItem item = repository.findItem(dealerId, itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Price-list item was not found."));
        return new ItemCommentsDto(item.id(), item.comments());
    }

    @Transactional
    public List<HistoryDto> reviseCurrentItem(long dealerId, long userId, long itemId,
                                               PriceListItemUpdateRequest request) {
        StoredItem previous = repository.findItem(dealerId, itemId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "Price-list item was not found."));
        if (!previous.current() || !previous.listStatus().equals("CONFIRMED")) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Only the current confirmed price can be edited.");
        }
        if (request.reason() == null || request.reason().isBlank()) {
            throw new IllegalArgumentException("Enter a reason for this price revision.");
        }
        String trade = normalizeText(request.tradeName());
        String technical = normalizeText(request.technicalName());
        UnitMatch unitMatch = normalizeUnit(request.unit(), request.unitSize());
        List<String> validationNotes = validateItem(request, trade, technical);
        if (!validationNotes.isEmpty() || request.reviewStatus().equalsIgnoreCase("EXCLUDED")) {
            throw new IllegalArgumentException("Correct the product and price fields before saving the revision: "
                    + String.join(" ", validationNotes));
        }
        long newListId = repository.createManualEditList(dealerId, userId, previous.companyId(),
                previous.effectiveDate(), previous.effectivePeriodText());
        PriceListFileParser.ParsedItem revision = new PriceListFileParser.ParsedItem(
                blankToNull(request.tradeName()), blankToNull(request.technicalName()), trade, technical,
                request.unitSize(), unitMatch.unit(), unitMatch.size(),
                unitMatch.matchUnit(), request.priceExGstPerUnit(),
                request.gstPercent(), request.priceInclGstPerUnit(), request.mrpPerUnit(),
                blankToNull(request.category()), blankToNull(request.comments()),
                blankToNull(request.sourceReference()), "READY", null);
        long newItemId = repository.insertItem(dealerId, newListId, previous.companyId(), revision);
        repository.setCurrent(dealerId, previous.id(), false);
        repository.setCurrent(dealerId, newItemId, true);
        StoredItem current = repository.findItem(dealerId, newItemId)
                .orElseThrow(() -> new IllegalStateException("Revised price was not returned."));
        repository.recordAudit(dealerId, newListId, previous.id(), newItemId,
                "MANUAL_EDIT", changedFields(previous, current),
                blankToNull(request.reason()), userId);
        return repository.findHistory(dealerId, current);
    }

    public List<AuditDto> audit(long dealerId) {
        return repository.findAudit(dealerId);
    }

    public List<CompanyDto> companies(long dealerId) {
        return repository.findCompanies(dealerId);
    }

    public List<String> technicalNames(long dealerId) {
        return repository.findTechnicalNames(dealerId);
    }

    private List<String> validateItem(PriceListItemUpdateRequest request, String trade, String technical) {
        List<String> notes = new ArrayList<>();
        validateNumericRange(request.unitSize(), 4, 14, "Unit Size");
        validateNumericRange(request.priceExGstPerUnit(), 2, 14, "Price Ex-GST per Unit");
        validateNumericRange(request.gstPercent(), 2, 5, "GST %");
        validateNumericRange(request.priceInclGstPerUnit(), 2, 14, "Price Incl-GST per Unit");
        validateNumericRange(request.mrpPerUnit(), 2, 14, "MRP per Unit");
        if (trade.isBlank() && technical.isBlank()) notes.add("Enter a trade name or technical name.");
        if (request.unit() == null || request.unit().isBlank()) notes.add("Enter a unit.");
        if (request.unitSize() == null || request.unitSize().signum() <= 0) {
            notes.add("Unit Size must be greater than zero.");
        }
        if (request.priceExGstPerUnit() == null) notes.add("Price Ex-GST per Unit is required.");
        if (request.gstPercent() == null) notes.add("GST % is required.");
        if (request.priceInclGstPerUnit() == null) notes.add("Price Incl-GST per Unit is required.");
        if (request.priceExGstPerUnit() != null && request.gstPercent() != null
                && request.priceInclGstPerUnit() != null
                && request.priceExGstPerUnit()
                .multiply(BigDecimal.ONE.add(request.gstPercent().movePointLeft(2)))
                .subtract(request.priceInclGstPerUnit()).abs().compareTo(GST_TOLERANCE) > 0) {
            notes.add("Price Incl-GST does not match Price Ex-GST and GST; verify source pricing.");
        }
        return notes;
    }

    private void validateNumericRange(BigDecimal value, int scale, int precision, String field) {
        if (value == null) return;
        if (value.stripTrailingZeros().scale() > scale) {
            throw new IllegalArgumentException(field + " supports at most " + scale + " decimal places.");
        }
        if (value.setScale(scale, java.math.RoundingMode.HALF_UP).precision() > precision) {
            throw new IllegalArgumentException(field + " exceeds the supported numeric range.");
        }
    }

    private List<String> duplicateKeys(List<StoredItem> items) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (StoredItem item : items) {
            String key = item.companyId() + "|" + item.normalizedTechnicalName() + "|"
                    + item.normalizedTradeName() + "|" + item.matchUnitSize().stripTrailingZeros()
                    + "|" + item.matchUnit();
            counts.merge(key, 1, Integer::sum);
        }
        return counts.entrySet().stream().filter(entry -> entry.getValue() > 1)
                .map(Map.Entry::getKey).toList();
    }

    private String auditEvent(StoredItem previous, StoredItem next) {
        if (previous == null) return "ADDED";
        Map<String, Object> changes = changedFields(previous, next);
        if (changes.isEmpty()) return "UNCHANGED";
        if (changes.keySet().stream().anyMatch(field -> field.contains("price")
                || field.equals("gstPercent") || field.equals("mrpPerUnit"))) {
            return "PRICE_CHANGED";
        }
        return "DETAILS_CHANGED";
    }

    private Map<String, Object> changedFields(StoredItem oldItem, StoredItem newItem) {
        Map<String, Object> changes = new LinkedHashMap<>();
        if (oldItem == null) {
            changes.put("newItem", snapshot(newItem));
            return changes;
        }
        Map<String, Object> oldValues = snapshot(oldItem);
        Map<String, Object> newValues = snapshot(newItem);
        newValues.forEach((field, value) -> {
            if (!java.util.Objects.equals(oldValues.get(field), value)) {
                Map<String, Object> difference = new LinkedHashMap<>();
                difference.put("before", oldValues.get(field));
                difference.put("after", value);
                changes.put(field, difference);
            }
        });
        return changes;
    }

    private Map<String, Object> snapshot(StoredItem item) {
        Map<String, Object> values = new LinkedHashMap<>();
        values.put("tradeName", item.tradeName());
        values.put("technicalName", item.technicalName());
        values.put("unitSize", item.unitSize());
        values.put("unit", item.unit());
        values.put("priceExGstPerUnit", item.priceExGstPerUnit());
        values.put("gstPercent", item.gstPercent());
        values.put("priceInclGstPerUnit", item.priceInclGstPerUnit());
        values.put("mrpPerUnit", item.mrpPerUnit());
        values.put("category", item.category());
        values.put("comments", item.comments());
        values.put("sourceReference", item.sourceReference());
        return values;
    }

    private String normalizeText(String value) {
        return value == null ? "" : value.trim().toLowerCase(Locale.ROOT)
                .replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private UnitMatch normalizeUnit(String value, BigDecimal size) {
        String unit = value == null ? "" : value.trim();
        String normalized = unit.toLowerCase(Locale.ROOT).replaceAll("[.\\s]+", "");
        BigDecimal matchSize = size == null ? BigDecimal.ZERO : size;
        return switch (normalized) {
            case "g", "gm", "gms", "gram", "grams" ->
                    new UnitMatch("g", matchSize.movePointLeft(3).stripTrailingZeros(), "kg");
            case "kg", "kgs", "kilogram", "kilograms" ->
                    new UnitMatch("Kg", matchSize.stripTrailingZeros(), "kg");
            case "ml", "milliliter", "millilitre", "milliliters", "millilitres" ->
                    new UnitMatch("ml", matchSize.movePointLeft(3).stripTrailingZeros(), "ltr");
            case "l", "ltr", "ltrs", "liter", "litre", "liters", "litres" ->
                    new UnitMatch("Ltr", matchSize.stripTrailingZeros(), "ltr");
            case "no", "nos", "number", "unit", "pc", "pcs", "piece", "pieces", "each" ->
                    new UnitMatch("No", matchSize.stripTrailingZeros(), "no");
            default -> new UnitMatch(unit, matchSize.stripTrailingZeros(), normalized);
        };
    }

    private String sha256(byte[] content) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(content));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is unavailable.", ex);
        }
    }

    private record UnitMatch(String unit, BigDecimal size, String matchUnit) {}
}
