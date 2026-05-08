package com.lastmanstanding.security;

import com.lastmanstanding.entity.User;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.crypto.SecretKey;
import java.util.Date;
import java.util.Map;

@Service
public class JwtService {

    private final SecretKey signingKey;
    private final long accessTokenExpiration;
    private final long refreshTokenExpiration;

    public JwtService(
            @Value("${jwt.secret}") String secret,
            @Value("${jwt.access-token-expiration}") long accessTokenExpiration,
            @Value("${jwt.refresh-token-expiration}") long refreshTokenExpiration) {
        this.signingKey = Keys.hmacShaKeyFor(secret.getBytes());
        this.accessTokenExpiration = accessTokenExpiration;
        this.refreshTokenExpiration = refreshTokenExpiration;
    }

    /**
     * Generate a short-lived access token containing user identity and role claims.
     */
    public String generateAccessToken(User user) {
        return buildToken(user, accessTokenExpiration, true);
    }

    /**
     * Generate a longer-lived refresh token (minimal claims — just subject).
     */
    public String generateRefreshToken(User user) {
        return buildToken(user, refreshTokenExpiration, false);
    }

    public String generateDeleteToken(User user, long expirationMs) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);
        return Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .claims(Map.of("purpose", "ACCOUNT_DELETE"))
                .issuedAt(now)
                .expiration(expiry)
                .signWith(signingKey)
                .compact();
    }

    public boolean isDeleteTokenValidForUser(String token, Long userId) {
        try {
            Claims claims = parseToken(token);
            String purpose = claims.get("purpose", String.class);
            return "ACCOUNT_DELETE".equals(purpose) && String.valueOf(userId).equals(claims.getSubject());
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    /**
     * Extract the user ID (subject) from a token.
     */
    public Long extractUserId(String token) {
        Claims claims = parseToken(token);
        return Long.valueOf(claims.getSubject());
    }

    /**
     * Validate token signature and expiry.
     */
    public boolean isTokenValid(String token) {
        try {
            parseToken(token);
            return true;
        } catch (JwtException | IllegalArgumentException e) {
            return false;
        }
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private String buildToken(User user, long expirationMs, boolean includeExtraClaims) {
        Date now = new Date();
        Date expiry = new Date(now.getTime() + expirationMs);

        var builder = Jwts.builder()
                .subject(String.valueOf(user.getId()))
                .issuedAt(now)
                .expiration(expiry);

        if (includeExtraClaims) {
            builder.claim("email", user.getEmail())
                   .claim("username", user.getUsername())
                   .claim("role", user.getRole().name());
        }

        return builder.signWith(signingKey)
                       .compact();
    }

    private Claims parseToken(String token) {
        return Jwts.parser()
                .verifyWith(signingKey)
                .build()
                .parseSignedClaims(token)
                .getPayload();
    }
}
