package com.lastmanstanding.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Helper for the AT (access token) and RT (refresh token) cookies used to
 * authenticate the SPA. The tokens themselves are still issued by JwtService;
 * this class only handles cookie transport.
 *
 * AT/RT cookies are httpOnly and SameSite is configurable (Lax by default).
 * This class also prevents invalid SameSite=None + Secure=false combinations,
 * which browsers reject and silently drop.
 */
@Service
public class AuthCookieService {

    private static final Logger log = LoggerFactory.getLogger(AuthCookieService.class);

    public static final String ACCESS_TOKEN_COOKIE = "AT";
    public static final String REFRESH_TOKEN_COOKIE = "RT";

    private final SecureRandom random = new SecureRandom();
    private final boolean secure;
    private final String sameSite;
    private final long accessTokenMaxAgeSeconds;
    private final long refreshTokenMaxAgeSeconds;

    public AuthCookieService(
            @Value("${app.cookies.secure:false}") boolean secure,
            @Value("${app.cookies.same-site:Lax}") String sameSite,
            @Value("${jwt.access-token-expiration}") long accessTokenMaxAgeSeconds,
            @Value("${jwt.refresh-token-expiration}") long refreshTokenMaxAgeSeconds) {
        this.secure = secure;
        this.sameSite = resolveSameSite(sameSite, secure);
        this.accessTokenMaxAgeSeconds = accessTokenMaxAgeSeconds / 1000;
        this.refreshTokenMaxAgeSeconds = refreshTokenMaxAgeSeconds / 1000;
        log.info("Auth cookie policy configured: secure={}, sameSite={}", this.secure, this.sameSite);
    }

    public void writeAccessToken(HttpServletResponse response, String token) {
        writeToken(response, ACCESS_TOKEN_COOKIE, token, accessTokenMaxAgeSeconds);
    }

    public void writeRefreshToken(HttpServletResponse response, String token) {
        writeToken(response, REFRESH_TOKEN_COOKIE, token, refreshTokenMaxAgeSeconds);
    }

    public void clearAll(HttpServletResponse response) {
        for (String name : new String[]{ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE}) {
            Cookie cookie = new Cookie(name, "");
            cookie.setPath("/");
            cookie.setHttpOnly(true);
            cookie.setSecure(secure);
            cookie.setMaxAge(0);
            cookie.setAttribute("SameSite", sameSite);
            response.addCookie(cookie);
        }
    }

    public String readAccessToken(HttpServletRequest request) {
        return readCookie(request, ACCESS_TOKEN_COOKIE);
    }

    public String readRefreshToken(HttpServletRequest request) {
        return readCookie(request, REFRESH_TOKEN_COOKIE);
    }

    private void writeToken(HttpServletResponse response, String name, String token, long maxAgeSeconds) {
        Cookie cookie = new Cookie(name, token);
        cookie.setPath("/");
        cookie.setHttpOnly(true);
        cookie.setSecure(secure);
        cookie.setMaxAge((int) maxAgeSeconds);
        cookie.setAttribute("SameSite", sameSite);
        response.addCookie(cookie);
    }

    private static String resolveSameSite(String configured, boolean secure) {
        String normalized = normalizeSameSite(configured);

        // Browsers reject SameSite=None cookies unless Secure is also set.
        if ("None".equals(normalized) && !secure) {
            log.warn("Invalid cookie policy detected (SameSite=None with secure=false). Falling back to SameSite=Lax.");
            return "Lax";
        }
        return normalized;
    }

    private static String normalizeSameSite(String configured) {
        if (configured == null) return "Lax";
        if ("none".equalsIgnoreCase(configured)) return "None";
        if ("strict".equalsIgnoreCase(configured)) return "Strict";
        if ("lax".equalsIgnoreCase(configured)) return "Lax";
        log.warn("Unknown SameSite value '{}' for auth cookies. Falling back to Lax.", configured);
        return "Lax";
    }

    private static String readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (name.equals(c.getName())) {
                String value = c.getValue();
                return (value == null || value.isEmpty()) ? null : value;
            }
        }
        return null;
    }

    public String generateCsrfToken() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    public boolean isSecure() {
        return secure;
    }
}