package com.lastmanstanding.service;

import com.lastmanstanding.entity.*;
import com.lastmanstanding.repository.*;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.PaymentIntent;
import com.stripe.param.PaymentIntentCreateParams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;

@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final PaymentRepository paymentRepository;
    private final CompetitionRepository competitionRepository;
    private final UserRepository userRepository;
    private final CompetitionService competitionService;

    @Value("${stripe.secret-key:}")
    private String stripeSecretKey;

    @Value("${stripe.publishable-key:}")
    private String stripePublishableKey;

    public PaymentService(PaymentRepository paymentRepository,
                          CompetitionRepository competitionRepository,
                          UserRepository userRepository,
                          CompetitionService competitionService) {
        this.paymentRepository = paymentRepository;
        this.competitionRepository = competitionRepository;
        this.userRepository = userRepository;
        this.competitionService = competitionService;
    }

    public String getPublishableKey() {
        return stripePublishableKey;
    }

    public boolean isConfigured() {
        return stripeSecretKey != null
                && !stripeSecretKey.isBlank()
                && !stripeSecretKey.startsWith("sk_test_your");
    }

    /**
     * Creates a Stripe PaymentIntent for the competition entry fee.
     * Returns the client secret to pass to the frontend.
     */
    @Transactional
    public PaymentIntentResponse createPaymentIntent(Long competitionId, Long userId) {
        Competition comp = competitionRepository.findById(competitionId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Competition not found"));

        if (comp.getStatus() != CompetitionStatus.UPCOMING) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Competition has already started");
        }

        if (comp.getEntryFee() == null || comp.getEntryFee().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This competition is free — no payment needed");
        }

        if (!isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Payment processing is not configured. Please contact the administrator.");
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (paymentRepository.existsByUserIdAndCompetitionIdAndStatus(
                userId, competitionId, Payment.PaymentStatus.SUCCEEDED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already paid for this competition");
        }

        Stripe.apiKey = stripeSecretKey;

        // Convert entry fee to cents (Stripe uses smallest currency unit)
        long entryFeeCents = comp.getEntryFee().multiply(BigDecimal.valueOf(100)).longValue();

        // If the organiser has chosen to pass fees to the participant, gross-up the charge
        // so the organiser receives exactly the entry fee after Stripe's cut.
        // Gross-up formula: chargeAmount = (entryFee + fixedFee) / (1 - percentageRate)
        // Using standard EU card rate: 1.5% + €0.25
        long chargeAmountCents;
        if (comp.isPassFeeToParticipant()) {
            double grossed = (entryFeeCents + 25.0) / (1.0 - 0.015);
            chargeAmountCents = (long) Math.ceil(grossed);
        } else {
            chargeAmountCents = entryFeeCents;
        }

        FeeEstimate fees = estimateFees(chargeAmountCents);

        try {
            PaymentIntentCreateParams params = PaymentIntentCreateParams.builder()
                    .setAmount(chargeAmountCents)
                    .setCurrency("eur")
                    .setDescription("Entry fee: " + comp.getName())
                    .setAutomaticPaymentMethods(
                            PaymentIntentCreateParams.AutomaticPaymentMethods.builder()
                                    .setEnabled(true)
                                    .build()
                    )
                    .putMetadata("competitionId", String.valueOf(competitionId))
                    .putMetadata("userId", String.valueOf(userId))
                    .putMetadata("userEmail", user.getEmail())
                    .build();

            PaymentIntent intent = PaymentIntent.create(params);

            // Persist the payment record as PENDING (store what the participant is actually charged)
            Payment payment = new Payment(user, comp, intent.getId(), (int) chargeAmountCents, "eur");
            paymentRepository.save(payment);

            return new PaymentIntentResponse(
                    intent.getClientSecret(),
                    intent.getId(),
                    chargeAmountCents,
                    entryFeeCents,
                    fees.processingCents(),
                    fees.taxCents(),
                    fees.netCents(),
                    comp.isPassFeeToParticipant()
            );

        } catch (StripeException e) {
            log.error("Stripe error creating PaymentIntent: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Payment service error: " + e.getMessage());
        }
    }

    /**
     * Confirms a successful payment and joins the user to the competition.
     * Called by the frontend after Stripe payment succeeds.
     */
    @Transactional
    public void confirmPaymentAndJoin(String paymentIntentId, Long userId) {
        if (!isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Payment processing is not configured.");
        }

        Stripe.apiKey = stripeSecretKey;

        try {
            // Verify with Stripe that payment actually succeeded
            PaymentIntent intent = PaymentIntent.retrieve(paymentIntentId);

            if (!"succeeded".equals(intent.getStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Payment not yet succeeded (status: " + intent.getStatus() + ")");
            }

            // Update local payment record
            Payment payment = paymentRepository.findByStripePaymentIntentId(paymentIntentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment record not found"));

            if (!payment.getUser().getId().equals(userId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Payment does not belong to this user");
            }

            payment.setStatus(Payment.PaymentStatus.SUCCEEDED);
            paymentRepository.save(payment);

            // Join the competition
            competitionService.joinCompetition(payment.getCompetition().getId(), userId);

        } catch (ResponseStatusException e) {
            throw e;
        } catch (StripeException e) {
            log.error("Stripe error confirming PaymentIntent: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Payment verification error. Please contact support.");
        }
    }

    /**
     * Estimates Stripe processing fees for a given charge amount in cents.
     * EU card rate: 1.5% + €0.25, plus 23% Irish VAT on the fee.
     */
    public static FeeEstimate estimateFees(long chargeAmountCents) {
        long processingCents = Math.round(chargeAmountCents * 0.015) + 25;
        long taxCents = Math.round(processingCents * 0.23);
        long totalFeeCents = processingCents + taxCents;
        long netCents = chargeAmountCents - totalFeeCents;
        return new FeeEstimate(processingCents, taxCents, totalFeeCents, netCents);
    }

    public record FeeEstimate(long processingCents, long taxCents, long totalFeeCents, long netCents) {}

    public record PaymentIntentResponse(
            String clientSecret,
            String paymentIntentId,
            long amountCents,           // what the participant is charged
            long entryFeeCents,         // the organiser's entry fee
            long estimatedProcessingFeeCents,
            long estimatedTaxCents,
            long estimatedNetCents,     // what the organiser receives
            boolean feePassedToParticipant
    ) {}
}

