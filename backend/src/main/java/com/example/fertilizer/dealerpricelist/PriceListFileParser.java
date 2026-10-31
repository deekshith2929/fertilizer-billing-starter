package com.example.fertilizer.dealerpricelist;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.stream.Collectors;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.FormulaEvaluator;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.springframework.stereotype.Component;

@Component
public class PriceListFileParser {
    private static final List<String> HEADERS = List.of(
            "Company Name", "Price List Effective Date", "Trade Name", "Technical Name",
            "Unit Size", "Unit", "Price Ex-GST per Unit", "GST %", "Price Incl-GST per Unit",
            "MRP per Unit", "Category", "Comments", "Source Page/Row");
    private static final Map<String, Integer> HEADER_INDEX = headerIndexes();

    public ParsedFile parse(byte[] bytes, String fileName) {
        String lowerName = fileName.toLowerCase(Locale.ROOT);
        List<List<String>> rows;
        if (lowerName.endsWith(".csv")) {
            rows = parseCsv(bytes);
        } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
            rows = parseWorkbook(bytes);
        } else {
            throw new IllegalArgumentException("Upload a standard .xlsx, .xls, or .csv price-list file.");
        }
        return validateAndMap(rows);
    }

    public static List<String> headers() {
        return HEADERS;
    }

    private List<List<String>> parseWorkbook(byte[] bytes) {
        try (Workbook workbook = WorkbookFactory.create(new ByteArrayInputStream(bytes))) {
            if (workbook.getNumberOfSheets() == 0) {
                throw new IllegalArgumentException("The workbook does not contain a worksheet.");
            }
            var sheet = workbook.getSheetAt(0);
            DataFormatter formatter = new DataFormatter(Locale.ROOT);
            FormulaEvaluator evaluator = workbook.getCreationHelper().createFormulaEvaluator();
            List<List<String>> rows = new ArrayList<>();
            for (Row row : sheet) {
                List<String> values = new ArrayList<>();
                for (int column = 0; column < HEADERS.size(); column++) {
                    Cell cell = row.getCell(column, Row.MissingCellPolicy.RETURN_BLANK_AS_NULL);
                    values.add(cell == null ? "" : formatter.formatCellValue(cell, evaluator).trim());
                }
                rows.add(values);
            }
            return rows;
        } catch (IOException ex) {
            throw new IllegalArgumentException("Could not read the Excel file. Check that it is a valid workbook.", ex);
        }
    }

    private List<List<String>> parseCsv(byte[] bytes) {
        String text = new String(bytes, java.nio.charset.StandardCharsets.UTF_8);
        if (!text.isEmpty() && text.charAt(0) == '\uFEFF') text = text.substring(1);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean quoted = false;
        for (int index = 0; index < text.length(); index++) {
            char current = text.charAt(index);
            if (current == '"') {
                if (quoted && index + 1 < text.length() && text.charAt(index + 1) == '"') {
                    field.append('"');
                    index++;
                } else {
                    quoted = !quoted;
                }
            } else if (current == ',' && !quoted) {
                row.add(field.toString().trim());
                field.setLength(0);
            } else if ((current == '\n' || current == '\r') && !quoted) {
                if (current == '\r' && index + 1 < text.length() && text.charAt(index + 1) == '\n') index++;
                row.add(field.toString().trim());
                field.setLength(0);
                rows.add(row);
                row = new ArrayList<>();
            } else {
                field.append(current);
            }
        }
        if (quoted) throw new IllegalArgumentException("The CSV file contains an unclosed quoted field.");
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString().trim());
            rows.add(row);
        }
        return rows;
    }

    private ParsedFile validateAndMap(List<List<String>> rows) {
        int headerRowIndex = -1;
        Map<String, Integer> columns = Map.of();
        for (int index = 0; index < rows.size(); index++) {
            Map<String, Integer> candidate = new HashMap<>();
            List<String> values = rows.get(index);
            for (int column = 0; column < values.size(); column++) {
                String normalized = normalizeHeader(values.get(column));
                if (HEADER_INDEX.containsKey(normalized)) candidate.put(normalized, column);
            }
            if (candidate.containsKey(normalizeHeader("Company Name"))
                    && candidate.containsKey(normalizeHeader("Trade Name"))
                    && candidate.containsKey(normalizeHeader("Unit Size"))) {
                headerRowIndex = index;
                columns = candidate;
                break;
            }
        }
        if (headerRowIndex < 0) {
            throw new IllegalArgumentException("Template headers were not found. Use the provided price-list template.");
        }
        Map<String, Integer> detectedColumns = columns;
        List<String> missingHeaders = HEADERS.stream()
                .filter(header -> !detectedColumns.containsKey(normalizeHeader(header)))
                .toList();
        if (!missingHeaders.isEmpty()) {
            throw new IllegalArgumentException("Template is missing required columns: "
                    + String.join(", ", missingHeaders));
        }

        List<ParsedItem> items = new ArrayList<>();
        String companyName = null;
        String effectivePeriod = null;
        LocalDate effectiveDate = null;
        for (int rowIndex = headerRowIndex + 1; rowIndex < rows.size(); rowIndex++) {
            List<String> values = rows.get(rowIndex);
            if (values.stream().allMatch(String::isBlank)) continue;
            String rowCompany = value(values, detectedColumns, "Company Name");
            String rowPeriod = value(values, detectedColumns, "Price List Effective Date");
            if (rowCompany.isBlank()) {
                throw new IllegalArgumentException("Company Name is blank at source row " + (rowIndex + 1) + ".");
            }
            String normalizedCompany = normalizeText(rowCompany);
            if (companyName == null) {
                companyName = rowCompany.trim();
                if (companyName.length() > 200) {
                    throw new IllegalArgumentException("Company Name exceeds the 200 character limit.");
                }
                effectivePeriod = rowPeriod.isBlank() ? null : rowPeriod.trim();
                validateLength(effectivePeriod, 100, "Price List Effective Date", rowIndex + 1);
                effectiveDate = parseDate(rowPeriod);
            } else if (!normalizeText(companyName).equals(normalizedCompany)) {
                throw new IllegalArgumentException("The uploaded report contains more than one company name.");
            } else if (!Objects.equals(normalizeOptional(effectivePeriod), normalizeOptional(rowPeriod))) {
                throw new IllegalArgumentException("Use one effective date value throughout the uploaded report.");
            }
            items.add(parseItem(values, detectedColumns, rowIndex + 1));
        }
        if (items.isEmpty() || companyName == null) {
            throw new IllegalArgumentException("The uploaded template does not contain any product rows.");
        }
        flagDuplicateRows(items);
        return new ParsedFile(companyName, effectiveDate, effectivePeriod, List.copyOf(items));
    }

    private ParsedItem parseItem(List<String> values, Map<String, Integer> columns, int sourceRow) {
        String tradeName = value(values, columns, "Trade Name");
        String technicalName = value(values, columns, "Technical Name");
        String unitText = value(values, columns, "Unit");
        String comments = value(values, columns, "Comments");
        String sourceReference = value(values, columns, "Source Page/Row");
        if (sourceReference.isBlank()) sourceReference = "Row " + sourceRow;
        validateLength(tradeName, 250, "Trade Name", sourceRow);
        validateLength(technicalName, 500, "Technical Name", sourceRow);
        validateLength(unitText, 24, "Unit", sourceRow);
        validateLength(value(values, columns, "Category"), 100, "Category", sourceRow);
        validateLength(sourceReference, 50, "Source Page/Row", sourceRow);
        List<String> issues = new ArrayList<>();
        if (tradeName.isBlank() && technicalName.isBlank()) issues.add("Enter a trade name or technical name.");
        if (unitText.isBlank()) issues.add("Enter a unit (for example, Kg, Ltr, ml, g, or No).");

        BigDecimal unitSize = normalizeDecimal(parseNumber(value(values, columns, "Unit Size"),
                "Unit Size", issues), 4, 14, "Unit Size", issues);
        if (unitSize == null || unitSize.signum() <= 0) {
            issues.add("Unit Size must be greater than zero.");
            unitSize = BigDecimal.ZERO;
        }
        BigDecimal priceExGst = normalizeDecimal(parseNumber(value(values, columns, "Price Ex-GST per Unit"),
                "Price Ex-GST per Unit", issues), 2, 14, "Price Ex-GST per Unit", issues);
        BigDecimal gst = normalizeDecimal(parseNumber(value(values, columns, "GST %"),
                "GST %", issues), 2, 5, "GST %", issues);
        BigDecimal priceInclGst = normalizeDecimal(parseNumber(value(values, columns, "Price Incl-GST per Unit"),
                "Price Incl-GST per Unit", issues), 2, 14, "Price Incl-GST per Unit", issues);
        BigDecimal mrp = normalizeDecimal(parseNumber(value(values, columns, "MRP per Unit"),
                "MRP per Unit", issues), 2, 14, "MRP per Unit", issues);
        if (priceExGst == null) issues.add("Price Ex-GST per Unit is required.");
        if (gst == null) issues.add("GST % is required.");
        if (priceInclGst == null) issues.add("Price Incl-GST per Unit is required.");
        if (gst != null && (gst.signum() < 0 || gst.compareTo(new BigDecimal("100")) > 0)) {
            issues.add("GST % must be between 0 and 100.");
        }
        if (priceExGst != null && priceExGst.signum() < 0) {
            issues.add("Price Ex-GST per Unit cannot be negative.");
        }
        if (priceInclGst != null && priceInclGst.signum() < 0) {
            issues.add("Price Incl-GST per Unit cannot be negative.");
        }
        if (mrp != null && mrp.signum() < 0) {
            issues.add("MRP per Unit cannot be negative.");
        }
        if (priceExGst != null && gst != null && priceInclGst != null
                && priceExGst.multiply(BigDecimal.ONE.add(gst.movePointLeft(2)))
                .subtract(priceInclGst).abs().compareTo(new BigDecimal("0.02")) > 0) {
            issues.add("Price Incl-GST does not match Price Ex-GST and GST; verify source pricing.");
        }

        String reviewNotes = issues.stream().distinct().collect(Collectors.joining(" "));
        String reviewStatus = reviewNotes.isBlank() ? "READY" : "NEEDS_REVIEW";
        String unit = normalizeUnit(unitText);
        BigDecimal matchSize = unitSize;
        String matchUnit = unit.toLowerCase(Locale.ROOT);
        if (unit.equalsIgnoreCase("g")) {
            matchSize = unitSize.movePointLeft(3);
            matchUnit = "kg";
        } else if (unit.equalsIgnoreCase("ml")) {
            matchSize = unitSize.movePointLeft(3);
            matchUnit = "ltr";
        } else if (unit.equalsIgnoreCase("l")) {
            matchUnit = "ltr";
        } else if (unit.equalsIgnoreCase("pcs") || unit.equalsIgnoreCase("each")) {
            matchUnit = "no";
        }
        return new ParsedItem(blankToNull(tradeName), blankToNull(technicalName),
                normalizeText(tradeName), normalizeText(technicalName), unitSize, unit,
                matchSize.stripTrailingZeros(), matchUnit, priceExGst, gst, priceInclGst, mrp,
                blankToNull(value(values, columns, "Category")), blankToNull(comments),
                sourceReference, reviewStatus, blankToNull(reviewNotes));
    }

    private void flagDuplicateRows(List<ParsedItem> items) {
        Map<String, List<Integer>> indexes = new LinkedHashMap<>();
        for (int index = 0; index < items.size(); index++) {
            ParsedItem item = items.get(index);
            String key = item.normalizedTechnicalName() + "|" + item.normalizedTradeName()
                    + "|" + item.matchUnitSize().toPlainString() + "|" + item.matchUnit();
            indexes.computeIfAbsent(key, ignored -> new ArrayList<>()).add(index);
        }
        for (List<Integer> duplicateIndexes : indexes.values()) {
            if (duplicateIndexes.size() < 2) continue;
            for (int index : duplicateIndexes) {
                ParsedItem item = items.get(index);
                String duplicateNote = "This product and unit appear more than once in the file; verify before confirming.";
                items.set(index, item.withReviewNote(duplicateNote));
            }
        }
    }

    private BigDecimal parseNumber(String text, String field, List<String> issues) {
        if (text.isBlank()) return null;
        String normalized = text.replace("₹", "").replace("%", "").trim();
        if (!normalized.matches("[+-]?(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?")) {
            issues.add(field + " is not a valid number.");
            return null;
        }
        try {
            return new BigDecimal(normalized.replace(",", ""));
        } catch (NumberFormatException ex) {
            issues.add(field + " is not a valid number.");
            return null;
        }
    }

    private BigDecimal normalizeDecimal(BigDecimal value, int scale, int precision,
                                        String field, List<String> issues) {
        if (value == null) return null;
        BigDecimal normalized = value.setScale(scale, RoundingMode.HALF_UP);
        if (normalized.compareTo(value) != 0) {
            issues.add(field + " has more decimal places than supported; verify the rounded value.");
        }
        if (normalized.precision() > precision) {
            issues.add(field + " exceeds the supported numeric range.");
            return null;
        }
        return normalized;
    }

    private String value(List<String> row, Map<String, Integer> columns, String header) {
        Integer index = columns.get(normalizeHeader(header));
        return index == null || index >= row.size() ? "" : row.get(index).trim();
    }

    private LocalDate parseDate(String text) {
        if (text == null || text.isBlank()) return null;
        for (DateTimeFormatter formatter : List.of(
                DateTimeFormatter.ISO_LOCAL_DATE,
                DateTimeFormatter.ofPattern("d.M.uuuu"),
                DateTimeFormatter.ofPattern("d/M/uuuu"),
                DateTimeFormatter.ofPattern("d-M-uuuu"))) {
            try {
                return LocalDate.parse(text.trim(), formatter);
            } catch (DateTimeParseException ignored) {
                // Try the next supported date representation.
            }
        }
        return null;
    }

    private String normalizeUnit(String value) {
        String lower = value.trim().toLowerCase(Locale.ROOT).replaceAll("[.\\s]+", "");
        return switch (lower) {
            case "kg", "kgs", "kilogram", "kilograms" -> "Kg";
            case "g", "gm", "gms", "gram", "grams" -> "g";
            case "l", "ltr", "ltrs", "liter", "litre", "liters", "litres" -> "Ltr";
            case "ml", "milliliter", "millilitre", "milliliters", "millilitres" -> "ml";
            case "no", "nos", "number", "unit" -> "No";
            case "pc", "pcs", "piece", "pieces", "each" -> "pcs";
            default -> value.trim();
        };
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    private void validateLength(String value, int maxLength, String field, int row) {
        if (value != null && value.length() > maxLength) {
            throw new IllegalArgumentException(field + " exceeds the " + maxLength
                    + " character limit at source row " + row + ".");
        }
    }

    private String normalizeText(String value) {
        if (value == null) return "";
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[^\\p{L}\\p{N}]+", " ").trim();
    }

    private String normalizeOptional(String value) {
        return value == null || value.isBlank() ? null : normalizeText(value);
    }

    private String normalizeHeader(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
    }

    private static Map<String, Integer> headerIndexes() {
        Map<String, Integer> indexes = new HashMap<>();
        for (int index = 0; index < HEADERS.size(); index++) {
            String header = HEADERS.get(index).toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]", "");
            indexes.put(header, index);
        }
        return Map.copyOf(indexes);
    }

    public record ParsedFile(String companyName, LocalDate effectiveDate, String effectivePeriodText,
                             List<ParsedItem> items) {}

    public record ParsedItem(String tradeName, String technicalName, String normalizedTradeName,
                             String normalizedTechnicalName, BigDecimal unitSize, String unit,
                             BigDecimal matchUnitSize, String matchUnit, BigDecimal priceExGstPerUnit,
                             BigDecimal gstPercent, BigDecimal priceInclGstPerUnit, BigDecimal mrpPerUnit,
                             String category, String comments, String sourceReference, String reviewStatus,
                             String reviewNotes) {
        ParsedItem withReviewNote(String note) {
            String updatedNotes = reviewNotes == null ? note : reviewNotes + " " + note;
            return new ParsedItem(tradeName, technicalName, normalizedTradeName,
                    normalizedTechnicalName, unitSize, unit, matchUnitSize, matchUnit,
                    priceExGstPerUnit, gstPercent, priceInclGstPerUnit, mrpPerUnit,
                    category, comments, sourceReference, "NEEDS_REVIEW", updatedNotes);
        }
    }
}
