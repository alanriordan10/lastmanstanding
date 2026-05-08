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

    public JwtAuthenticationFilter(JwtService jwtService, UserRepository userRepository) {
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }

    // ── Skip authentication for public auth endpoints ───────────────────

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getServletPath();
        // These /auth endpoints require authentication — don't skip JWT processing for them
        if (path.equals("/auth/me") || path.equals("/auth/email-preferences") || path.equals("/auth/delete-token")) {
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

        String authHeader = request.getHeader("Authorization");

        if (authHeader == null || !authHeader.startsWith("Bearer ")) {
            filterChain.doFilter(request, response);
            return;
        }

        String token = authHeader.substring(7);

        if (!jwtService.isTokenValid(token)) {
            filterChain.doFilter(request, response);
            return;
        }

        Long userId = jwtService.extractUserId(token);

        // If a valid Bearer JWT is present, prefer JWT auth for this request.
        // This avoids OAuth2 session principal type mismatches on endpoints expecting UserDetailsImpl.
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
}
