package com.lastmanstanding.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Adds the Content-Security-Policy header to every response. Spring Security's
 * headers DSL in 6.4.x returns sub-configurers from each method (permissionsPolicy
 * returns PermissionsPolicyConfig, etc.), which breaks chained configuration when
 * you want to add multiple security headers. A direct filter is simpler and
 * more explicit.
 */
@Component
public class CspHeaderFilter extends OncePerRequestFilter {

    private static final String CSP = "default-src 'none'; " +
            "frame-ancestors 'none'; " +
            "base-uri 'none'; " +
            "form-action 'none'";

    @Override
    protected void doFilterInternal(@NonNull HttpServletRequest request,
                                    @NonNull HttpServletResponse response,
                                    @NonNull FilterChain filterChain) throws ServletException, IOException {
        response.setHeader("Content-Security-Policy", CSP);
        filterChain.doFilter(request, response);
    }
}