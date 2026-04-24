package com.lastmanstanding.controller;

import com.lastmanstanding.security.UserDetailsImpl;
import com.lastmanstanding.service.PaymentService;
import com.lastmanstanding.service.PaymentService.PaymentIntentResponse;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /** Returns the Stripe publishable key for the frontend to initialise Stripe.js */
    @GetMapping("/config")
    public ResponseEntity<ConfigResponse> getConfig() {
        return ResponseEntity.ok(new ConfigResponse(paymentService.getPublishableKey()));
    }

    /** Creates a PaymentIntent for a competition entry fee */
    @PostMapping("/competitions/{competitionId}/intent")
    public ResponseEntity<PaymentIntentResponse> createIntent(
            @PathVariable Long competitionId,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        PaymentIntentResponse response = paymentService.createPaymentIntent(competitionId, userDetails.getId());
        return ResponseEntity.ok(response);
    }

    /** Called after Stripe confirms payment — verifies and joins the competition */
    @PostMapping("/competitions/{competitionId}/confirm")
    public ResponseEntity<Void> confirmAndJoin(
            @PathVariable Long competitionId,
            @RequestBody ConfirmRequest request,
            @AuthenticationPrincipal UserDetailsImpl userDetails) {
        paymentService.confirmPaymentAndJoin(request.paymentIntentId(), userDetails.getId());
        return ResponseEntity.ok().build();
    }

    public record ConfigResponse(String publishableKey) {}
    public record ConfirmRequest(String paymentIntentId) {}
}
