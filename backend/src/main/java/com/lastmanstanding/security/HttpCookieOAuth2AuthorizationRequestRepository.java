package com.lastmanstanding.security;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.security.oauth2.client.web.AuthorizationRequestRepository;
import org.springframework.security.oauth2.core.endpoint.OAuth2AuthorizationRequest;
import org.springframework.stereotype.Component;
import org.springframework.util.SerializationUtils;

import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Optional;

@Component
public class HttpCookieOAuth2AuthorizationRequestRepository implements AuthorizationRequestRepository<OAuth2AuthorizationRequest> {

    private static final String OAUTH2_AUTH_REQUEST_COOKIE_NAME = "lms_oauth2_auth_request";
    private static final int COOKIE_EXPIRE_SECONDS = 180;

    @Override
    public OAuth2AuthorizationRequest loadAuthorizationRequest(HttpServletRequest request) {
        return getCookie(request, OAUTH2_AUTH_REQUEST_COOKIE_NAME)
                .map(Cookie::getValue)
                .map(this::deserialize)
                .orElse(null);
    }

    @Override
    public void saveAuthorizationRequest(
            OAuth2AuthorizationRequest authorizationRequest,
            HttpServletRequest request,
            HttpServletResponse response
    ) {
        if (authorizationRequest == null) {
            deleteCookie(request, response, OAUTH2_AUTH_REQUEST_COOKIE_NAME);
            return;
        }
        addCookie(request, response, OAUTH2_AUTH_REQUEST_COOKIE_NAME, serialize(authorizationRequest), COOKIE_EXPIRE_SECONDS);
    }

    @Override
    public OAuth2AuthorizationRequest removeAuthorizationRequest(HttpServletRequest request, HttpServletResponse response) {
        OAuth2AuthorizationRequest authorizationRequest = loadAuthorizationRequest(request);
        deleteCookie(request, response, OAUTH2_AUTH_REQUEST_COOKIE_NAME);
        return authorizationRequest;
    }

    private String serialize(OAuth2AuthorizationRequest authorizationRequest) {
        byte[] bytes = SerializationUtils.serialize(authorizationRequest);
        return Base64.getUrlEncoder().encodeToString(bytes == null ? new byte[0] : bytes);
    }

    private OAuth2AuthorizationRequest deserialize(String cookieValue) {
        byte[] bytes = Base64.getUrlDecoder().decode(cookieValue.getBytes(StandardCharsets.UTF_8));
        Object value = SerializationUtils.deserialize(bytes);
        return value instanceof OAuth2AuthorizationRequest request ? request : null;
    }

    private static Optional<Cookie> getCookie(HttpServletRequest request, String name) {
        Cookie[] cookies = request.getCookies();
        if (cookies == null) return Optional.empty();
        for (Cookie cookie : cookies) {
            if (name.equals(cookie.getName())) {
                return Optional.of(cookie);
            }
        }
        return Optional.empty();
    }

    private static void addCookie(HttpServletRequest request, HttpServletResponse response, String name, String value, int maxAgeSeconds) {
        String cookie = name + "=" + value
                + "; Max-Age=" + maxAgeSeconds
                + "; Path=/"
                + "; HttpOnly"
                + "; SameSite=Lax"
                + (isSecureRequest(request) ? "; Secure" : "");
        response.addHeader("Set-Cookie", cookie);
    }

    private static void deleteCookie(HttpServletRequest request, HttpServletResponse response, String name) {
        String cookie = name + "="
                + "; Max-Age=0"
                + "; Path=/"
                + "; HttpOnly"
                + "; SameSite=Lax"
                + (isSecureRequest(request) ? "; Secure" : "");
        response.addHeader("Set-Cookie", cookie);
    }

    private static boolean isSecureRequest(HttpServletRequest request) {
        String forwardedProto = request.getHeader("X-Forwarded-Proto");
        return request.isSecure() || "https".equalsIgnoreCase(forwardedProto);
    }
}
