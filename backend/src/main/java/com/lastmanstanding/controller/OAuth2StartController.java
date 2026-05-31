package com.lastmanstanding.controller;

import jakarta.servlet.http.HttpSession;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class OAuth2StartController {

    public static final String OAUTH_CLIENT_SESSION_KEY = "oauth_client";
    public static final String MOBILE_CLIENT = "mobile";

    @GetMapping("/oauth2/mobile/google")
    public String startMobileGoogleLogin(HttpSession session) {
        session.setAttribute(OAUTH_CLIENT_SESSION_KEY, MOBILE_CLIENT);
        return "redirect:/oauth2/authorization/google";
    }
}
