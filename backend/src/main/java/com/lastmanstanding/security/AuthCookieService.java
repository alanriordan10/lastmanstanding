package com.lastmanstanding.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.util.Base64;

/**
 * Helper for the AT (access token) and RT (refresh token) cookies used to
 * authenticate the SPA. The tokens themselves are still issued by JwtService;
 * this class only handles cookie transport.
 *
 * AT/RT cookies are httpOnly + SameSite=Strict, so they cannot be read by
 * JavaScript and a cross-origin attacker cannot ride them.
 */
@Service
public class AuthCookieService {

    public static final String ACCESS_TOKEN_COOKIE = "AT";
    public static final String REFRESH_TOKEN_COOKIE = "RT";

    private final SecureRandom random = new SecureRandom();
    private final boolean secure;
    private final long accessTokenMaxAgeSeconds;
    private final long refreshTokenMaxAgeSeconds;

    public AuthCookieService(
            @Value("${app.cookies.secure:false}") boolean secure,
            @Value("${jwt.access-token-expiration}") long accessTokenMaxAgeSeconds,
            @Value("${jwt.refresh-token-expiration}") long refreshTokenMaxAgeSeconds) {
        this.secure = secure;
        this.accessTokenMaxAgeSeconds = accessTokenMaxAgeSeconds / 1000;
        this.refreshTokenMaxAgeSeconds = refreshTokenMaxAgeSeconds / 1000;
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
            cookie.setAttribute("SameSite", "None");
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
        cookie.setAttribute("SameSite", "None");
        response.addCookie(cookie);
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