package com.lastmanstanding.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.Map;

/**
 * Resend email API client using HTTP REST calls.
 * Sends emails via Resend's REST API instead of SMTP.
 */
@Component
public class ResendEmailClient {

    private static final Logger log = LoggerFactory.getLogger(ResendEmailClient.class);
    private static final String RESEND_API_URL = "https://api.resend.com/emails";

    private final RestTemplate restTemplate;
    private final String apiKey;

    public ResendEmailClient(RestTemplate restTemplate, @Value("${app.resend-api-key:}") String apiKey) {
        this.restTemplate = restTemplate;
        this.apiKey = apiKey;
    }

    /**
     * Send an email via Resend API.
     * @param from Sender email address
     * @param to Recipient email address
     * @param subject Email subject
     * @param html Email body (HTML)
     * @throws IllegalArgumentException if API key is not configured
     */
    public void sendEmail(String from, String to, String subject, String html) {
        if (apiKey == null || apiKey.isBlank()) {
            throw new IllegalArgumentException("RESEND_API_KEY environment variable is not configured");
        }

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.APPLICATION_JSON);
        headers.set("Authorization", "Bearer " + apiKey);

        Map<String, Object> requestBody = new HashMap<>();
        requestBody.put("from", from);
        requestBody.put("to", to);
        requestBody.put("subject", subject);
        requestBody.put("html", html);

        HttpEntity<Map<String, Object>> request = new HttpEntity<>(requestBody, headers);

        try {
            restTemplate.postForObject(RESEND_API_URL, request, Map.class);
            log.debug("Email sent successfully to {} via Resend API", to);
        } catch (Exception e) {
            log.error("Failed to send email to {} via Resend API: {}", to, e.getMessage());
            throw new RuntimeException("Failed to send email via Resend API: " + e.getMessage(), e);
        }
    }
}
