package com.lastmanstanding.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.Set;

/**
 * Implements a "double submit cookie" CSRF defence.
 *
 * On every request:
 *   - Sets a fresh XSRF-TOKEN cookie (non-httpOnly, so JS can read it).
 *   - For state-changing methods (POST/PUT/PATCH/DELETE), compares the cookie
 *     to the X-XSRF-TOKEN request header. If they don't match, returns 403.
 *
 * The CSRF token is only validated when an authentication cookie is present,
 * so anonymous GETs and the very first login are unaffected.
 */
@Component
public class CsrfFilter extends OncePerRequestFilter {

    public static final String CSRF_COOKIE = "XSRF-TOKEN";
    public static final String CSRF_HEADER = "X-XSRF-TOKEN";
    private static final Set<String> STATE_CHANGING = Set.of("POST", "PUT", "PATCH", "DELETE");

    private final AuthCookieService cookieService;

    public CsrfFilter(AuthCookieService cookieService) {
        this.cookieService = cookieService;
    }

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {

        ensureCsrfCookie(request, response);

        // CSRF only applies to ambient authentication (cookies). Requests that
        // carry an explicit Authorization header (mobile app, API clients) are
        // not CSRF-vulnerable and skip the check.
        boolean hasExplicitAuth = request.getHeader("Authorization") != null;

        if (!hasExplicitAuth && STATE_CHANGING.contains(request.getMethod()) && hasAuthCookie(request)
                && !isPublicAuthEndpoint(request)) {
            String tokenInCookie = readCookie(request, CSRF_COOKIE);
            String tokenInHeader = request.getHeader(CSRF_HEADER);
            if (tokenInCookie == null || tokenInHeader == null || !tokenInCookie.equals(tokenInHeader)) {
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"status\":403,\"error\":\"Forbidden\",\"message\":\"CSRF token mismatch\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }

    /**
     * Public auth endpoints can't be CSRF'd meaningfully — an attacker forcing
     * a login logs themselves in, not the victim. Skip the check so that
     * mobile clients (which store cookies via the native HTTP stack and don't
     * send a custom CSRF header on these calls) can sign in reliably.
     */
    private static boolean isPublicAuthEndpoint(HttpServletRequest request) {
        String path = request.getRequestURI();
        return "/auth/login".equals(path)
                || "/auth/signup".equals(path)
                || "/auth/register-club".equals(path)
                || "/auth/forgot-password".equals(path)
                || "/auth/reset-password".equals(path);
    }

    private void ensureCsrfCookie(HttpServletRequest request, HttpServletResponse response) {
        if (request.getCookies() == null || readCookie(request, CSRF_COOKIE) == null) {
            String token = cookieService.generateCsrfToken();
            Cookie cookie = new Cookie(CSRF_COOKIE, token);
            cookie.setPath("/");
            cookie.setHttpOnly(false);
            cookie.setSecure(cookieService.isSecure());
            cookie.setMaxAge(60 * 60 * 24);
            cookie.setAttribute("SameSite", "Strict");
            response.addCookie(cookie);
        }
    }

    private boolean hasAuthCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return false;
        for (Cookie c : request.getCookies()) {
            if (AuthCookieService.ACCESS_TOKEN_COOKIE.equals(c.getName())
                    || AuthCookieService.REFRESH_TOKEN_COOKIE.equals(c.getName())) {
                return true;
            }
        }
        return false;
    }

    private static String readCookie(HttpServletRequest request, String name) {
        if (request.getCookies() == null) return null;
        for (Cookie c : request.getCookies()) {
            if (name.equals(c.getName())) return c.getValue();
        }
        return null;
    }
}