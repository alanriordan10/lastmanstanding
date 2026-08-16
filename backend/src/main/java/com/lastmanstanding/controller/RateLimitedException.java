package com.lastmanstanding.controller;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a login attempt is blocked due to rate limiting.
 * Includes a retryAfterSeconds value surfaced as the Retry-After header.
 */
public class RateLimitedException extends RuntimeException {

    private final HttpStatus status = HttpStatus.TOO_MANY_REQUESTS;
    private final long retryAfterSeconds;

    public RateLimitedException(String message, long retryAfterSeconds) {
        super(message);
        this.retryAfterSeconds = retryAfterSeconds;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public long getRetryAfterSeconds() {
        return retryAfterSeconds;
    }
}