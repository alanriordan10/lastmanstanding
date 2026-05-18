package com.lastmanstanding.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
public class ClientErrorController {

    private static final Logger log = LoggerFactory.getLogger(ClientErrorController.class);

    @PostMapping("/client-errors")
    public ResponseEntity<Map<String, String>> captureClientError(@RequestBody ClientErrorRequest request) {
        log.error(
                "client_error source={} page={} path={} message={} ua={} ts={} stack={} componentStack={}",
                safe(request.source()),
                safe(request.page()),
                safe(request.path()),
                safe(request.message()),
                safe(request.userAgent()),
                safe(request.timestamp()),
                safe(request.stack()),
                safe(request.componentStack())
        );
        return ResponseEntity.accepted().body(Map.of("status", "accepted"));
    }

    private static String safe(String value) {
        return value == null ? "" : value;
    }

    public record ClientErrorRequest(
            String source,
            String page,
            String message,
            String stack,
            String componentStack,
            String path,
            String userAgent,
            String timestamp
    ) {
    }
}
