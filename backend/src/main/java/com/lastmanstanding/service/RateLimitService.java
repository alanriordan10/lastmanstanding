package com.lastmanstanding.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * Tracks failed attempts per email and per IP across several scopes
 * (login, forgot-password, signup) using Caffeine. Each scope has its own
 * limits and sliding window.
 */
@Service
public class RateLimitService {

    public enum Scope {
        LOGIN,
        FORGOT_PASSWORD,
        SIGNUP
    }

    private final Cache<String, AttemptRecord> attempts;

    private final int loginMaxAttemptsPerEmail;
    private final int loginMaxAttemptsPerIp;
    private final Duration loginEmailWindow;
    private final Duration loginIpWindow;

    private final int forgotMaxAttemptsPerEmail;
    private final int forgotMaxAttemptsPerIp;
    private final Duration forgotEmailWindow;
    private final Duration forgotIpWindow;

    private final int signupMaxAttemptsPerIp;
    private final Duration signupIpWindow;

    public RateLimitService(
            @Value("${security.login.max-attempts-per-email:5}") int loginMaxAttemptsPerEmail,
            @Value("${security.login.max-attempts-per-ip:30}") int loginMaxAttemptsPerIp,
            @Value("${security.login.email-window-minutes:15}") int loginEmailWindowMinutes,
            @Value("${security.login.ip-window-minutes:60}") int loginIpWindowMinutes,
            @Value("${security.forgot.max-attempts-per-email:5}") int forgotMaxAttemptsPerEmail,
            @Value("${security.forgot.max-attempts-per-ip:20}") int forgotMaxAttemptsPerIp,
            @Value("${security.forgot.email-window-minutes:60}") int forgotEmailWindowMinutes,
            @Value("${security.forgot.ip-window-minutes:60}") int forgotIpWindowMinutes,
            @Value("${security.signup.max-attempts-per-ip:5}") int signupMaxAttemptsPerIp,
            @Value("${security.signup.ip-window-minutes:60}") int signupIpWindowMinutes) {
        this.loginMaxAttemptsPerEmail = loginMaxAttemptsPerEmail;
        this.loginMaxAttemptsPerIp = loginMaxAttemptsPerIp;
        this.loginEmailWindow = Duration.ofMinutes(loginEmailWindowMinutes);
        this.loginIpWindow = Duration.ofMinutes(loginIpWindowMinutes);

        this.forgotMaxAttemptsPerEmail = forgotMaxAttemptsPerEmail;
        this.forgotMaxAttemptsPerIp = forgotMaxAttemptsPerIp;
        this.forgotEmailWindow = Duration.ofMinutes(forgotEmailWindowMinutes);
        this.forgotIpWindow = Duration.ofMinutes(forgotIpWindowMinutes);

        this.signupMaxAttemptsPerIp = signupMaxAttemptsPerIp;
        this.signupIpWindow = Duration.ofMinutes(signupIpWindowMinutes);

        this.attempts = Caffeine.newBuilder()
                .expireAfterWrite(Duration.ofHours(4))
                .maximumSize(100_000)
                .build();
    }

    // ── Login (legacy keys kept for AuthController) ─────────────────────

    public boolean isEmailLimited(String email) {
        return isEmailLimited(Scope.LOGIN, email);
    }

    public boolean isIpLimited(String ip) {
        return isIpLimited(Scope.LOGIN, ip);
    }

    public long emailRetryAfterSeconds(String email) {
        return retryAfterSeconds(Scope.LOGIN, emailKey(email));
    }

    public long ipRetryAfterSeconds(String ip) {
        return retryAfterSeconds(Scope.LOGIN, ipKey(ip));
    }

    public void recordFailedAttempt(String email, String ip) {
        if (email != null && !email.isBlank()) {
            bump(Scope.LOGIN, emailKey(email), loginEmailWindow);
        }
        if (ip != null && !ip.isBlank()) {
            bump(Scope.LOGIN, ipKey(ip), loginIpWindow);
        }
    }

    public void recordSuccessfulLogin(String email, String ip) {
        if (email != null && !email.isBlank()) {
            attempts.invalidate(Scope.LOGIN + ":" + emailKey(email));
        }
        if (ip != null && !ip.isBlank()) {
            attempts.invalidate(Scope.LOGIN + ":" + ipKey(ip));
        }
    }

    public int remainingAttemptsForEmail(String email) {
        if (email == null || email.isBlank()) return loginMaxAttemptsPerEmail;
        AttemptRecord rec = attempts.getIfPresent(Scope.LOGIN + ":" + emailKey(email));
        int used = rec == null ? 0 : rec.count.get();
        return Math.max(0, loginMaxAttemptsPerEmail - used);
    }

    // ── Generic per-scope checks ────────────────────────────────────────

    public boolean isEmailLimited(Scope scope, String email) {
        if (email == null || email.isBlank()) return false;
        AttemptRecord rec = attempts.getIfPresent(scope + ":" + emailKey(email));
        return rec != null && rec.count.get() >= emailLimit(scope);
    }

    public boolean isIpLimited(Scope scope, String ip) {
        if (ip == null || ip.isBlank()) return false;
        AttemptRecord rec = attempts.getIfPresent(scope + ":" + ipKey(ip));
        return rec != null && rec.count.get() >= ipLimit(scope);
    }

    public long retryAfterSeconds(Scope scope, String rawKey) {
        AttemptRecord rec = attempts.getIfPresent(scope + ":" + rawKey);
        if (rec == null) return 0;
        long elapsedMs = System.currentTimeMillis() - rec.firstAttemptAt;
        long windowMs = rawKey.startsWith("email:")
                ? emailWindowForScope(scope).toMillis()
                : ipWindowForScope(scope).toMillis();
        return Math.max(1, (windowMs - elapsedMs) / 1000);
    }

    // ── Forgot password ────────────────────────────────────────────────

    public void recordForgotPasswordAttempt(String email, String ip) {
        if (email != null && !email.isBlank()) {
            bump(Scope.FORGOT_PASSWORD, emailKey(email), forgotEmailWindow);
        }
        if (ip != null && !ip.isBlank()) {
            bump(Scope.FORGOT_PASSWORD, ipKey(ip), forgotIpWindow);
        }
    }

    public boolean isForgotPasswordEmailLimited(String email) {
        return isEmailLimited(Scope.FORGOT_PASSWORD, email);
    }

    public boolean isForgotPasswordIpLimited(String ip) {
        return isIpLimited(Scope.FORGOT_PASSWORD, ip);
    }

    public long forgotPasswordEmailRetryAfterSeconds(String email) {
        return retryAfterSeconds(Scope.FORGOT_PASSWORD, emailKey(email));
    }

    public long forgotPasswordIpRetryAfterSeconds(String ip) {
        return retryAfterSeconds(Scope.FORGOT_PASSWORD, ipKey(ip));
    }

    // ── Signup ──────────────────────────────────────────────────────────

    public void recordSignupAttempt(String ip) {
        if (ip != null && !ip.isBlank()) {
            bump(Scope.SIGNUP, ipKey(ip), signupIpWindow);
        }
    }

    public boolean isSignupIpLimited(String ip) {
        return isIpLimited(Scope.SIGNUP, ip);
    }

    public long signupIpRetryAfterSeconds(String ip) {
        return retryAfterSeconds(Scope.SIGNUP, ipKey(ip));
    }

    // ── Internals ───────────────────────────────────────────────────────

    private int emailLimit(Scope scope) {
        return scope == Scope.LOGIN ? loginMaxAttemptsPerEmail : forgotMaxAttemptsPerEmail;
    }

    private int ipLimit(Scope scope) {
        return switch (scope) {
            case LOGIN -> loginMaxAttemptsPerIp;
            case FORGOT_PASSWORD -> forgotMaxAttemptsPerIp;
            case SIGNUP -> signupMaxAttemptsPerIp;
        };
    }

    private Duration emailWindowForScope(Scope scope) {
        return scope == Scope.LOGIN ? loginEmailWindow : forgotEmailWindow;
    }

    private Duration ipWindowForScope(Scope scope) {
        return switch (scope) {
            case LOGIN -> loginIpWindow;
            case FORGOT_PASSWORD -> forgotIpWindow;
            case SIGNUP -> signupIpWindow;
        };
    }

    private static String emailKey(String email) {
        return "email:" + email.toLowerCase();
    }

    private static String ipKey(String ip) {
        return "ip:" + ip;
    }

    private void bump(Scope scope, String rawKey, Duration window) {
        AttemptRecord rec = attempts.get(scope + ":" + rawKey, k -> new AttemptRecord(System.currentTimeMillis()));
        rec.count.incrementAndGet();
        attempts.put(scope + ":" + rawKey, rec);
    }

    private static final class AttemptRecord {
        final long firstAttemptAt;
        final AtomicInteger count = new AtomicInteger(0);

        AttemptRecord(long firstAttemptAt) {
            this.firstAttemptAt = firstAttemptAt;
        }
    }
}