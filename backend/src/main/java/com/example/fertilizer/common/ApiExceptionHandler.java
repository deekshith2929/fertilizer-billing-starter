package com.example.fertilizer.common;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, Object>> handleValidation(MethodArgumentNotValidException ex) {
        Map<String, String> errors = new LinkedHashMap<>();
        for (FieldError error : ex.getBindingResult().getFieldErrors()) errors.put(error.getField(), error.getDefaultMessage());
        return response(HttpStatus.BAD_REQUEST, "Validation failed", errors);
    }
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, Object>> handleBadRequest(IllegalArgumentException ex) {
        return response(HttpStatus.BAD_REQUEST, ex.getMessage(), Map.of());
    }
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> handleDatabase(DataAccessException ex) {
        log.error("Database operation failed", ex);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "A database operation failed. Check backend logs.", Map.of());
    }
    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, Object>> handleUnexpected(Exception ex) {
        log.error("Unhandled API exception", ex);
        return response(HttpStatus.INTERNAL_SERVER_ERROR, "Unexpected server error. Check backend logs.", Map.of());
    }
    private ResponseEntity<Map<String, Object>> response(HttpStatus status, String message, Map<String, ?> details) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", OffsetDateTime.now().toString()); body.put("status", status.value());
        body.put("error", status.getReasonPhrase()); body.put("message", message); body.put("details", details);
        return ResponseEntity.status(status).body(body);
    }
}
