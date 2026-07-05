package com.lastmanstanding.security;

import com.lastmanstanding.controller.OAuth2StartController;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

import java.io.IOException;
import java.util.Optional;

@Component
public class OAuth2AuthenticationFailureRedirectHandler implements AuthenticationFailureHandler {

    private static final Logger log = LoggerFactory.getLogger(OAuth2AuthenticationFailureRedirectHandler.class);

    private final String frontendUrl;
    private final String mobileOauthCallbackUrl;

    public OAuth2AuthenticationFailureRedirectHandler(
            @Value("${app.frontend-url:http://localhost:5173}") String frontendUrl,
            @Value("${app.mobile-oauth-callback-url:lastmanstanding://oauth2/callback}") String mobileOauthCallbackUrl
    ) {
        this.frontendUrl = frontendUrl;
        this.mobileOauthCallbackUrl = mobileOauthCallbackUrl;
    }

    @Override
    public void onAuthenticationFailure(
            HttpServletRequest request,
            HttpServletResponse response,
            AuthenticationException exception
    ) throws IOException, ServletException {
        log.warn("OAuth2 authentication failed: {}", exception.getMessage());
        String target = callbackBuilder(request)
                .queryParam("error", "oauth_failed")
                .build()
                .toUriString();
        response.sendRedirect(target);
    }

    private UriComponentsBuilder callbackBuilder(HttpServletRequest request) {
        var session = request.getSession(false);
        boolean mobileClient = Optional.ofNullable(session)
                .map((currentSession) -> {
                    Object client = currentSession.getAttribute(OAuth2StartController.OAUTH_CLIENT_SESSION_KEY);
                    currentSession.removeAttribute(OAuth2StartController.OAUTH_CLIENT_SESSION_KEY);
                    return OAuth2StartController.MOBILE_CLIENT.equals(client);
                })
                .orElse(false);
        String returnTo = Optional.ofNullable(session)
                .map((currentSession) -> {
                    Object value = currentSession.getAttribute(OAuth2StartController.OAUTH_RETURN_TO_SESSION_KEY);
                    currentSession.removeAttribute(OAuth2StartController.OAUTH_RETURN_TO_SESSION_KEY);
                    return value instanceof String text && text.startsWith("/") ? text : null;
                })
                .orElse(null);

        UriComponentsBuilder builder = mobileClient
                ? UriComponentsBuilder.fromUriString(mobileOauthCallbackUrl)
                : UriComponentsBuilder.fromHttpUrl(frontendUrl).path("/oauth2/callback");
        if (returnTo != null) {
            builder.queryParam("returnTo", returnTo);
        }
        return builder;
    }
}
