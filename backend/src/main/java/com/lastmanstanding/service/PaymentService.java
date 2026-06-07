package com.lastmanstanding.service;

import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.PaymentMode;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.UserRepository;
import com.stripe.Stripe;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Account;
import com.stripe.model.AccountLink;
import com.stripe.model.Charge;
import com.stripe.model.Event;
import com.stripe.model.LoginLink;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeObject;
import com.stripe.net.Webhook;
import com.stripe.param.AccountCreateParams;
import com.stripe.param.AccountLinkCreateParams;
import com.stripe.param.LoginLinkCreateOnAccountParams;
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
    private final ClubRepository clubRepository;
    private final CompetitionService competitionService;

    @Value("${stripe.secret-key:}")
    private String stripeSecretKey;

    @Value("${stripe.publishable-key:}")
    private String stripePublishableKey;

    @Value("${stripe.webhook-secret:}")
    private String stripeWebhookSecret;

    @Value("${stripe.connect.return-url:}")
    private String stripeConnectReturnUrl;

    @Value("${stripe.connect.refresh-url:}")
    private String stripeConnectRefreshUrl;

    @Value("${stripe.platform-fee-bps:0}")
    private int stripePlatformFeeBps;

    public PaymentService(PaymentRepository paymentRepository,
                          CompetitionRepository competitionRepository,
                          UserRepository userRepository,
                          ClubRepository clubRepository,
                          CompetitionService competitionService) {
        this.paymentRepository = paymentRepository;
        this.competitionRepository = competitionRepository;
        this.userRepository = userRepository;
        this.clubRepository = clubRepository;
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

    @Transactional
    public ConnectOnboardingResponse startConnectOnboarding(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));

        ensureConfigured();
        Stripe.apiKey = stripeSecretKey;

        try {
            if (club.getStripeAccountId() == null || club.getStripeAccountId().isBlank()) {
                AccountCreateParams createParams = AccountCreateParams.builder()
                        .setType(AccountCreateParams.Type.EXPRESS)
                        .putMetadata("clubId", String.valueOf(club.getId()))
                        .build();
                Account account = Account.create(createParams);
                club.setStripeAccountId(account.getId());
                applyAccountState(club, account);
                clubRepository.save(club);
            }

            AccountLinkCreateParams linkParams = AccountLinkCreateParams.builder()
                    .setAccount(club.getStripeAccountId())
                    .setRefreshUrl(stripeConnectRefreshUrl)
                    .setReturnUrl(stripeConnectReturnUrl)
                    .setType(AccountLinkCreateParams.Type.ACCOUNT_ONBOARDING)
                    .build();
            AccountLink link = AccountLink.create(linkParams);
            return new ConnectOnboardingResponse(club.getStripeAccountId(), link.getUrl());
        } catch (StripeException e) {
            log.error("Stripe Connect onboarding setup failed for club {}: {}", clubId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe Connect error: " + e.getMessage());
        }
    }

    @Transactional
    public ConnectStatusResponse getConnectStatus(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));

        if (club.getStripeAccountId() != null && !club.getStripeAccountId().isBlank() && isConfigured()) {
            Stripe.apiKey = stripeSecretKey;
            try {
                Account account = Account.retrieve(club.getStripeAccountId());
                applyAccountState(club, account);
                clubRepository.save(club);
            } catch (StripeException e) {
                log.warn("Could not refresh Stripe account {}: {}", club.getStripeAccountId(), e.getMessage());
            }
        }

        return new ConnectStatusResponse(
                club.getStripeAccountId(),
                club.isStripeOnboardingComplete(),
                club.isStripeChargesEnabled(),
                club.isStripePayoutsEnabled()
        );
    }

    public DashboardLinkResponse createDashboardLink(Long clubId) {
        Club club = clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));

        if (club.getStripeAccountId() == null || club.getStripeAccountId().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Club has not connected Stripe");
        }

        ensureConfigured();
        Stripe.apiKey = stripeSecretKey;

        try {
            LoginLink loginLink = LoginLink.createOnAccount(
                    club.getStripeAccountId(),
                    LoginLinkCreateOnAccountParams.builder().build()
            );
            return new DashboardLinkResponse(loginLink.getUrl());
        } catch (StripeException e) {
            log.error("Stripe dashboard link creation failed for club {}: {}", clubId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Stripe Connect error: " + e.getMessage());
        }
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

        if (comp.getPaymentMode() == PaymentMode.STRIPE
                && (comp.getStripeDestinationAccountId() == null || comp.getStripeDestinationAccountId().isBlank())) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Competition is not Stripe-ready");
        }

        if (comp.getEntryFee() == null || comp.getEntryFee().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This competition is free — no payment needed");
        }

        ensureConfigured();

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "User not found"));

        if (paymentRepository.existsByUserIdAndCompetitionIdAndStatus(
                userId, competitionId, Payment.PaymentStatus.SUCCEEDED)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Already paid for this competition");
        }

        Stripe.apiKey = stripeSecretKey;

        long entryFeeCents = comp.getEntryFee().multiply(BigDecimal.valueOf(100)).longValue();

        long chargeAmountCents = comp.isPassFeeToParticipant()
                ? grossUpChargeAmountCents(entryFeeCents)
                : entryFeeCents;

        FeeEstimate fees = estimateFees(chargeAmountCents);
        long applicationFeeAmountCents = Math.round(chargeAmountCents * (stripePlatformFeeBps / 10000.0));

        try {
            PaymentIntentCreateParams.Builder paramsBuilder = PaymentIntentCreateParams.builder()
                    .setAmount(chargeAmountCents)
                    .setCurrency("eur")
                    .setDescription("Entry fee: " + comp.getName())
                    // Keep checkout focused: card wallets, Revolut Pay, and Klarna only.
                    .addPaymentMethodType("card")
                    .addPaymentMethodType("revolut_pay")
                    .addPaymentMethodType("klarna")
                    .putMetadata("competitionId", String.valueOf(competitionId))
                    .putMetadata("userId", String.valueOf(userId))
                    .putMetadata("userEmail", user.getEmail());

            if (comp.getPaymentMode() == PaymentMode.STRIPE) {
                paramsBuilder
                        .setApplicationFeeAmount(applicationFeeAmountCents)
                        .setTransferData(PaymentIntentCreateParams.TransferData.builder()
                                .setDestination(comp.getStripeDestinationAccountId())
                                .build());
            }

            PaymentIntent intent = PaymentIntent.create(paramsBuilder.build());

            Payment payment = new Payment(user, comp, intent.getId(), (int) chargeAmountCents, "eur");
            if (comp.getPaymentMode() == PaymentMode.STRIPE) {
                payment.setApplicationFeeAmountCents((int) applicationFeeAmountCents);
                payment.setDestinationAccountId(comp.getStripeDestinationAccountId());
            }
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
        ensureConfigured();
        Stripe.apiKey = stripeSecretKey;

        try {
            PaymentIntent intent = PaymentIntent.retrieve(paymentIntentId);

            if (!"succeeded".equals(intent.getStatus())) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Payment not yet succeeded (status: " + intent.getStatus() + ")");
            }

            Payment payment = paymentRepository.findByStripePaymentIntentId(paymentIntentId)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Payment record not found"));

            if (!payment.getUser().getId().equals(userId)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "Payment does not belong to this user");
            }

            markPaymentSucceeded(payment, intent, false);
            paymentRepository.save(payment);

            if (!paymentRepository.existsByUserIdAndCompetitionIdAndStatus(
                    userId, payment.getCompetition().getId(), Payment.PaymentStatus.SUCCEEDED)) {
                competitionService.joinCompetition(payment.getCompetition().getId(), userId);
            } else {
                tryJoinCompetition(payment.getCompetition().getId(), userId);
            }

        } catch (ResponseStatusException e) {
            throw e;
        } catch (StripeException e) {
            log.error("Stripe error confirming PaymentIntent: {}", e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "Payment verification error. Please contact support.");
        }
    }

    @Transactional
    public void handleWebhook(String payload, String signatureHeader) {
        ensureConfigured();
        if (stripeWebhookSecret == null || stripeWebhookSecret.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Stripe webhook secret not configured");
        }

        Event event;
        try {
            event = Webhook.constructEvent(payload, signatureHeader, stripeWebhookSecret);
        } catch (SignatureVerificationException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Stripe signature");
        }

        String type = event.getType();
        StripeObject obj = event.getDataObjectDeserializer().getObject().orElse(null);
        if (obj == null) {
            log.warn("Skipping Stripe event {} with missing data object", type);
            return;
        }

        switch (type) {
            case "account.updated" -> handleAccountUpdated((Account) obj);
            case "payment_intent.succeeded" -> handlePaymentIntentSucceeded((PaymentIntent) obj);
            case "payment_intent.payment_failed" -> handlePaymentIntentFailed((PaymentIntent) obj);
            default -> {
                if ("charge.refunded".equals(type)) {
                    handleChargeRefunded((Charge) obj);
                }
            }
        }
    }

    private void handleAccountUpdated(Account account) {
        clubRepository.findByStripeAccountId(account.getId()).ifPresent(club -> {
            applyAccountState(club, account);
            clubRepository.save(club);
        });
    }

    private void handlePaymentIntentSucceeded(PaymentIntent intent) {
        paymentRepository.findByStripePaymentIntentId(intent.getId()).ifPresent(payment -> {
            markPaymentSucceeded(payment, intent, true);
            paymentRepository.save(payment);
            tryJoinCompetition(payment.getCompetition().getId(), payment.getUser().getId());
        });
    }

    private void handlePaymentIntentFailed(PaymentIntent intent) {
        paymentRepository.findByStripePaymentIntentId(intent.getId()).ifPresent(payment -> {
            payment.setStatus(Payment.PaymentStatus.FAILED);
            paymentRepository.save(payment);
        });
    }

    private void handleChargeRefunded(Charge charge) {
        String paymentIntentId = charge.getPaymentIntent();
        if (paymentIntentId == null || paymentIntentId.isBlank()) {
            return;
        }
        paymentRepository.findByStripePaymentIntentId(paymentIntentId).ifPresent(payment -> {
            payment.setStatus(Payment.PaymentStatus.REFUNDED);
            paymentRepository.save(payment);
        });
    }

    private void markPaymentSucceeded(Payment payment, PaymentIntent intent, boolean webhookConfirmed) {
        payment.setStatus(Payment.PaymentStatus.SUCCEEDED);
        payment.setWebhookConfirmed(webhookConfirmed || payment.isWebhookConfirmed());
        if (intent.getLatestCharge() != null) {
            payment.setStripeChargeId(intent.getLatestCharge());
        }
        if (intent.getTransferData() != null && intent.getTransferData().getDestination() != null) {
            payment.setDestinationAccountId(intent.getTransferData().getDestination());
        }
        if (intent.getApplicationFeeAmount() != null) {
            payment.setApplicationFeeAmountCents(intent.getApplicationFeeAmount().intValue());
        }
    }

    private void applyAccountState(Club club, Account account) {
        club.setStripeOnboardingComplete(Boolean.TRUE.equals(account.getDetailsSubmitted()));
        club.setStripeChargesEnabled(Boolean.TRUE.equals(account.getChargesEnabled()));
        club.setStripePayoutsEnabled(Boolean.TRUE.equals(account.getPayoutsEnabled()));
    }

    private void tryJoinCompetition(Long competitionId, Long userId) {
        try {
            competitionService.joinCompetition(competitionId, userId);
        } catch (ResponseStatusException ex) {
            if (ex.getStatusCode() != HttpStatus.CONFLICT) {
                throw ex;
            }
        }
    }

    private void ensureConfigured() {
        if (!isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Payment processing is not configured. Please contact the administrator.");
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

    /**
     * Grosses up the customer charge so the estimated net amount covers the entry fee.
     * Uses cent-by-cent iteration to account for Stripe/VAT rounding at small amounts.
     */
    public static long grossUpChargeAmountCents(long entryFeeCents) {
        long chargeAmountCents = entryFeeCents;
        while (estimateFees(chargeAmountCents).netCents() < entryFeeCents) {
            chargeAmountCents++;
        }
        return chargeAmountCents;
    }

    public record FeeEstimate(long processingCents, long taxCents, long totalFeeCents, long netCents) {}

    public record PaymentIntentResponse(
            String clientSecret,
            String paymentIntentId,
            long amountCents,
            long entryFeeCents,
            long estimatedProcessingFeeCents,
            long estimatedTaxCents,
            long estimatedNetCents,
            boolean feePassedToParticipant
    ) {}

    public record ConnectOnboardingResponse(String stripeAccountId, String onboardingUrl) {}

    public record ConnectStatusResponse(
            String stripeAccountId,
            boolean onboardingComplete,
            boolean chargesEnabled,
            boolean payoutsEnabled
    ) {}

    public record DashboardLinkResponse(String url) {}
}
