package com.lastmanstanding.controller;

import com.lastmanstanding.entity.MobilePushToken;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.MobilePushTokenRepository;
import com.lastmanstanding.repository.UserRepository;
import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.WebPushService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/notifications")
public class NotificationController {

    private final WebPushService webPushService;
    private final MobilePushTokenRepository mobilePushTokenRepository;
    private final UserRepository userRepository;

    public NotificationController(WebPushService webPushService,
                                  MobilePushTokenRepository mobilePushTokenRepository,
                                  UserRepository userRepository) {
        this.webPushService = webPushService;
        this.mobilePushTokenRepository = mobilePushTokenRepository;
        this.userRepository = userRepository;
    }

    public record SubscriptionKeys(
            @NotBlank String p256dh,
            @NotBlank String auth
    ) {}

    public record SubscriptionRequest(
            @NotBlank String endpoint,
            @NotNull @Valid SubscriptionKeys keys
    ) {}

    public record MobileRegisterRequest(
            @NotBlank String token,
            @NotBlank String platform
    ) {}

    public record MobileUnregisterRequest(String token) {}

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

    @PostMapping("/mobile/register")
    public ResponseEntity<Void> registerMobileToken(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @Valid @RequestBody MobileRegisterRequest request) {
        User user = userRepository.findById(principal.getId())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.UNAUTHORIZED, "User not found"));

        MobilePushToken existing = mobilePushTokenRepository.findByToken(request.token()).orElse(null);
        if (existing == null) {
            mobilePushTokenRepository.save(new MobilePushToken(user, request.token(), request.platform()));
        } else {
            existing.setUser(user);
            existing.setPlatform(request.platform());
            mobilePushTokenRepository.save(existing);
        }

        return ResponseEntity.ok().build();
    }

    @DeleteMapping("/mobile/register")
    public ResponseEntity<Void> unregisterMobileToken(
            @AuthenticationPrincipal UserDetailsImpl principal,
            @RequestBody(required = false) MobileUnregisterRequest request) {
        if (request != null && request.token() != null && !request.token().isBlank()) {
            mobilePushTokenRepository.deleteByUserIdAndToken(principal.getId(), request.token());
        } else {
            mobilePushTokenRepository.deleteByUserId(principal.getId());
        }
        return ResponseEntity.noContent().build();
    }
}
