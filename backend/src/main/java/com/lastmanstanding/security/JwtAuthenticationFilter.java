package com.lastmanstanding.security;

import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.UserRepository;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.WebAuthenticationDetailsSource;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtService jwtService;
    private final UserRepository userRepository;
    private final AuthCookieService authCookieService;

    public JwtAuthenticationFilter(JwtService jwtService,
                                   UserRepository userRepository,
                                   AuthCookieService authCookieService) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
        this.authCookieService = authCookieService;
    }

    // ── Skip authentication for public auth endpoints ───────────────────

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        if (path.equals("/auth/me")
                || path.equals("/auth/email-preferences")
                || path.equals("/auth/notification-preferences")
                || path.equals("/auth/delete-token")
                || path.equals("/auth/create-club")) {
            return false;
        }
        if (path.startsWith("/oauth2") || path.startsWith("/login/oauth2")) {
            return true;
        }
        return path.startsWith("/auth");
    }

    // ── Main filter logic ───────────────────────────────────────────────

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain) throws ServletException, IOException {

        String token = resolveToken(request);
        if (token == null) {
            // No JWT — let session-based auth (OAuth2) take over.
            filterChain.doFilter(request, response);
            return;
        }

        if (!jwtService.isTokenValid(token)) {
            // A JWT cookie / header was present but invalid. Invalidate any
            // existing session (so a stale JSESSIONID can't keep the user
            // authenticated) and reject the request.
            invalidateSession(request);
            writeUnauthorized(response);
            return;
        }

        Long userId = jwtService.extractUserId(token);

        User user = userRepository.findById(userId).orElse(null);
        if (user != null) {
            UserDetailsImpl userDetails = new UserDetailsImpl(user);

            UsernamePasswordAuthenticationToken authentication =
                    new UsernamePasswordAuthenticationToken(
                            userDetails,
                            null,
                            userDetails.getAuthorities());

            authentication.setDetails(
                    new WebAuthenticationDetailsSource().buildDetails(request));

            SecurityContextHolder.getContext().setAuthentication(authentication);
        }

        filterChain.doFilter(request, response);
    }

    private static void invalidateSession(HttpServletRequest request) {
        try {
            var session = request.getSession(false);
            if (session != null) session.invalidate();
        } catch (IllegalStateException ignored) {
            // already invalidated
        }
        SecurityContextHolder.clearContext();
    }

    private static void writeUnauthorized(HttpServletResponse response) throws IOException {
        response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        response.setContentType("application/json");
        response.getWriter().write(
                "{\"status\":401,\"error\":\"Unauthorized\",\"message\":\"Invalid or expired token\"}");
    }

    private String resolveToken(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            return authHeader.substring(7);
        }
        return authCookieService.readAccessToken(request);
    }
}
