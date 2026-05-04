package com.lastmanstanding.security;

import com.lastmanstanding.entity.Role;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.UserRepository;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.Authentication;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.user.OAuth2User;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.Locale;
import java.util.Optional;
import java.util.UUID;

@Component
public class OAuth2AuthenticationSuccessHandler implements AuthenticationSuccessHandler {

    private final UserRepository userRepository;
    private final JwtService jwtService;
    private final String frontendUrl;

    public OAuth2AuthenticationSuccessHandler(
            UserRepository userRepository,
            JwtService jwtService,
            @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl
    ) {
        this.userRepository = userRepository;
        this.jwtService = jwtService;
        this.frontendUrl = frontendUrl;
    }

    @Override
    public void onAuthenticationSuccess(
            HttpServletRequest request,
            HttpServletResponse response,
            Authentication authentication
    ) throws IOException, ServletException {
        OAuth2AuthenticationToken authToken = (OAuth2AuthenticationToken) authentication;
        OAuth2User principal = authToken.getPrincipal();

        String provider = authToken.getAuthorizedClientRegistrationId().toLowerCase(Locale.ROOT);
        String providerId = principal.getName();
        String email = Optional.ofNullable(principal.<String>getAttribute("email"))
                .map(String::trim)
                .map(String::toLowerCase)
                .orElse(null);
        String displayName = Optional.ofNullable(principal.<String>getAttribute("name"))
                .map(String::trim)
                .filter((n) -> !n.isBlank())
                .orElse("Player");
        String avatarUrl = principal.getAttribute("picture");

        if (email == null || email.isBlank()) {
            redirectWithError(response, "missing_email");
            return;
        }

        User user = userRepository.findByOauthProviderAndOauthProviderId(provider, providerId)
                .or(() -> userRepository.findByEmail(email))
                .map((existing) -> updateOauthProfile(existing, provider, providerId, avatarUrl))
                .orElseGet(() -> createOauthUser(email, displayName, provider, providerId, avatarUrl));

        if (user.isDisabled()) {
            redirectWithError(response, "account_disabled");
            return;
        }

        String accessToken = jwtService.generateAccessToken(user);
        String target = UriComponentsBuilder.fromHttpUrl(frontendUrl)
                .path("/oauth2/callback")
                .queryParam("token", accessToken)
                .queryParam("provider", "Google")
                .build()
                .toUriString();
        response.sendRedirect(target);
    }

    private void redirectWithError(HttpServletResponse response, String error) throws IOException {
        String target = UriComponentsBuilder.fromHttpUrl(frontendUrl)
                .path("/oauth2/callback")
                .queryParam("error", error)
                .build()
                .toUriString();
        response.sendRedirect(target);
    }

    private User updateOauthProfile(
            User user,
            String provider,
            String providerId,
            String avatarUrl
    ) {
        user.setOauthProvider(provider);
        user.setOauthProviderId(providerId);
        if (avatarUrl != null && !avatarUrl.isBlank()) {
            user.setAvatarUrl(avatarUrl);
        }
        return userRepository.save(user);
    }

    private User createOauthUser(
            String email,
            String displayName,
            String provider,
            String providerId,
            String avatarUrl
    ) {
        User user = new User();
        user.setEmail(email);
        user.setUsername(generateUniqueUsername(displayName, email));
        user.setPasswordHash(null);
        user.setRole(Role.USER);
        user.setOauthProvider(provider);
        user.setOauthProviderId(providerId);
        user.setAvatarUrl(avatarUrl);
        return userRepository.save(user);
    }

    private String generateUniqueUsername(String displayName, String email) {
        String base = Optional.ofNullable(displayName)
                .map(String::trim)
                .filter((s) -> !s.isBlank())
                .orElse(email.split("@")[0])
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "");

        if (base.isBlank()) {
            base = "player";
        }
        if (base.length() > 20) {
            base = base.substring(0, 20);
        }

        String candidate = base;
        int attempts = 0;
        while (userRepository.existsByUsernameIgnoreCase(candidate) && attempts < 25) {
            attempts++;
            candidate = base + attempts;
        }
        if (!userRepository.existsByUsernameIgnoreCase(candidate)) {
            return candidate;
        }
        return base + UUID.randomUUID().toString().replace("-", "").substring(0, 6);
    }
}
