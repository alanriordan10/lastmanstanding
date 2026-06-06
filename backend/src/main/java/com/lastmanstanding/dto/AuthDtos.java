package com.lastmanstanding.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AuthDtos {

    private AuthDtos() {
        // Utility class — no instantiation
    }

    // ── Request DTOs ────────────────────────────────────────────────────

    public record SignupRequest(
            @NotBlank(message = "Email is required")
            @Email(message = "Email must be valid")
            String email,

            @NotBlank(message = "Username is required")
            @Size(min = 3, max = 30, message = "Username must be between 3 and 30 characters")
            @Pattern(regexp = "\\S+", message = "Username cannot contain spaces")
            String username,

            @NotBlank(message = "Password is required")
            @Size(min = 8, message = "Password must be at least 8 characters")
            String password
    ) {}

    public record LoginRequest(
            @NotBlank(message = "Email is required")
            String email,

            @NotBlank(message = "Password is required")
            String password
    ) {}

    public record RefreshRequest(
            @NotBlank(message = "Refresh token is required")
            String refreshToken
    ) {}

    // ── Response DTO ────────────────────────────────────────────────────

    public record AuthResponse(
            String accessToken,
            String refreshToken,
            Long userId,
            String email,
            String username,
            String role,
            boolean emailResultsOptIn,
            boolean notificationPickReminders,
            boolean notificationResultUpdates,
            boolean notificationCompetitionAnnouncements,
            boolean notificationPaymentUpdates
    ) {}
}
