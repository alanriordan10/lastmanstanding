package com.lastmanstanding.controller;

import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;

@Controller
public class OAuth2StartController {

    public static final String OAUTH_CLIENT_SESSION_KEY = "oauth_client";
    public static final String OAUTH_RETURN_TO_SESSION_KEY = "oauth_return_to";
    public static final String MOBILE_CLIENT = "mobile";

    @GetMapping("/oauth2/google")
    public String startWebGoogleLogin(@RequestParam(value = "returnTo", required = false) String returnTo, HttpSession session) {
        storeReturnTo(returnTo, session);
        session.removeAttribute(OAUTH_CLIENT_SESSION_KEY);
        return "redirect:/oauth2/authorization/google";
    }

    @GetMapping("/oauth2/mobile/google")
    public String startMobileGoogleLogin(@RequestParam(value = "returnTo", required = false) String returnTo, HttpSession session) {
        storeReturnTo(returnTo, session);
        session.setAttribute(OAUTH_CLIENT_SESSION_KEY, MOBILE_CLIENT);
        return "redirect:/oauth2/authorization/google";
    }

    private void storeReturnTo(String returnTo, HttpSession session) {
        if (StringUtils.hasText(returnTo) && returnTo.startsWith("/")) {
            session.setAttribute(OAUTH_RETURN_TO_SESSION_KEY, returnTo);
        } else {
            session.removeAttribute(OAUTH_RETURN_TO_SESSION_KEY);
        }
    }
}
