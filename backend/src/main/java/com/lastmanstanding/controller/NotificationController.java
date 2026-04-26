package com.lastmanstanding.controller;

import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.WebPushService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    private final WebPushService webPushService;

    public NotificationController(WebPushService webPushService) {
        this.webPushService = webPushService;
    }

    public record SubscriptionKeys(
            @NotBlank String p256dh,
            @NotBlank String auth
    ) {}

    public record SubscriptionRequest(
            @NotBlank String endpoint,
            @NotNull @Valid SubscriptionKeys keys
    ) {}

    @PostMapping("/subscribe")
    public ResponseEntity<Void> subscribe(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @Valid @RequestBody SubscriptionRequest request) {
        webPushService.saveSubscription(principal.getId(), request.endpoint(), request.keys().p256dh(), request.keys().auth());
        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/subscribe")
    public ResponseEntity<Void> unsubscribe(@AuthenticationPrincipal UserDetailsImpl principal) {
        webPushService.removeSubscriptionsForUser(principal.getId());
        return ResponseEntity.noContent().build();
    }
}
