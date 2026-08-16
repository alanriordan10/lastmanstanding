package com.lastmanstanding.config;

import com.lastmanstanding.controller.LoginFailedException;
import com.lastmanstanding.controller.RateLimitedException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, Object>> handleResponseStatusException(ResponseStatusException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", OffsetDateTime.now().toString());
        body.put("status", ex.getStatusCode().value());
        body.put("error", ex.getStatusCode().toString());
        body.put("message", ex.getReason() == null ? "Request failed" : ex.getReason());
        return ResponseEntity.status(ex.getStatusCode()).body(body);
    }

    @ExceptionHandler(LoginFailedException.class)
    public ResponseEntity<Map<String, Object>> handleLoginFailed(LoginFailedException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", OffsetDateTime.now().toString());
        body.put("status", ex.getStatus().value());
        body.put("error", ex.getStatus().toString());
        body.put("message", ex.getMessage());
        body.put("attemptsRemaining", ex.getAttemptsRemaining());
        return ResponseEntity.status(ex.getStatus()).body(body);
    }

    @ExceptionHandler(RateLimitedException.class)
    public ResponseEntity<Map<String, Object>> handleRateLimited(RateLimitedException ex) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("timestamp", OffsetDateTime.now().toString());
        body.put("status", ex.getStatus().value());
        body.put("error", ex.getStatus().toString());
        body.put("message", ex.getMessage());
        return ResponseEntity.status(ex.getStatus())
                .header(HttpHeaders.RETRY_AFTER, String.valueOf(ex.getRetryAfterSeconds()))
                .body(body);
    }
}