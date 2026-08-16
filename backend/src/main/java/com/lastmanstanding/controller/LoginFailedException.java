package com.lastmanstanding.controller;

import org.springframework.http.HttpStatus;

/**
 * Thrown for a failed login. Carries an attemptsRemaining value so the
 * frontend can show the user how many tries they have left.
 */
public class LoginFailedException extends RuntimeException {

    private final HttpStatus status = HttpStatus.UNAUTHORIZED;
    private final int attemptsRemaining;

    public LoginFailedException(String message, int attemptsRemaining) {
        super(message);
        this.attemptsRemaining = attemptsRemaining;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public int getAttemptsRemaining() {
        return attemptsRemaining;
    }
}