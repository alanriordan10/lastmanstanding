package com.lastmanstanding.service;

import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.Competition;
import com.lastmanstanding.entity.CompetitionParticipant;
import com.lastmanstanding.entity.CompetitionStatus;
import com.lastmanstanding.entity.Payment;
import com.lastmanstanding.entity.PaymentMode;
import com.lastmanstanding.entity.User;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.CompetitionRepository;
import com.lastmanstanding.repository.PaymentRepository;
import com.lastmanstanding.repository.UserRepository;
import com.stripe.Stripe;
import com.stripe.exception.EventDataObjectDeserializationException;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Account;
import com.stripe.model.AccountLink;
import com.stripe.model.Charge;
import com.stripe.model.Event;
import com.stripe.model.EventDataObjectDeserializer;
import com.stripe.model.LoginLink;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeObject;
import com.stripe.model.checkout.Session;
import com.stripe.net.Webhook;
import com.stripe.param.AccountCreateParams;
import com.stripe.param.AccountLinkCreateParams;
import com.stripe.param.LoginLinkCreateOnAccountParams;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.checkout.SessionCreateParams;
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
  private final CompetitionCacheService competitionCacheService;
  private final BillingService billingService;

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

  @Value("${stripe.platform-fee-enabled:false}")
  private boolean stripePlatformFeeEnabled;

  @Value("${stripe.platform-fee-percent:0}")
  private double stripePlatformFeePercent;

  @Value("${stripe.platform-fee-bps:0}")
  private int stripePlatformFeeBps;

  @Value("${stripe.demo-success-url:https://www.runlastmanstanding.com/services}")
  private String stripeDemoSuccessUrl;

  @Value("${stripe.demo-cancel-url:https://www.runlastmanstanding.com/services}")
  private String stripeDemoCancelUrl;

  @Value("${stripe.currency:eur}")
  private String stripeCurrency;

  @Value("${stripe.default-country:IE}")
  private String stripeDefaultCountry;

  public PaymentService(PaymentRepository paymentRepository,
                        CompetitionRepository competitionRepository,
                        UserRepository userRepository,
                        ClubRepository clubRepository,
                        CompetitionService competitionService,
                        CompetitionCacheService competitionCacheService,
                        BillingService billingService) {
    this.paymentRepository = paymentRepository;
    this.competitionRepository = competitionRepository;
    this.userRepository = userRepository;
    this.clubRepository = clubRepository;
    this.competitionService = competitionService;
    this.competitionCacheService = competitionCacheService;
    this.billingService = billingService;
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
            .setCountry(stripeDefaultCountry)
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

    if (comp.isPaused()) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Competition is paused — payments are temporarily unavailable");
    }
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

    int maxEntries = comp.getMaxEntriesPerUser() != null ? Math.max(1, comp.getMaxEntriesPerUser()) : 1;
    long paidEntries = paymentRepository.countByUserIdAndCompetitionIdAndStatus(
        userId, competitionId, Payment.PaymentStatus.SUCCEEDED);
    if (paidEntries >= maxEntries) {
      throw new ResponseStatusException(HttpStatus.CONFLICT, "Maximum paid entries reached for this competition");
    }

    Stripe.apiKey = stripeSecretKey;

    long entryFeeCents = comp.getEntryFee().multiply(BigDecimal.valueOf(100)).longValue();

    long chargeAmountCents = comp.isPassFeeToParticipant()
        ? grossUpChargeAmountCents(entryFeeCents)
        : entryFeeCents;

    FeeEstimate fees = estimateFees(chargeAmountCents);
    long applicationFeeAmountCents = calculatePlatformFeeCents(chargeAmountCents);
    long organiserNetCents = Math.max(0, fees.netCents() - applicationFeeAmountCents);

    try {
      PaymentIntentCreateParams.Builder paramsBuilder = PaymentIntentCreateParams.builder()
          .setAmount(chargeAmountCents)
          .setCurrency(stripeCurrency)
          .setDescription("Entry fee: " + comp.getName())
          // Keep checkout focused: card wallets, Revolut Pay, and Klarna only.
          .addPaymentMethodType("card")
          .addPaymentMethodType("revolut_pay")
          .addPaymentMethodType("klarna")
          .putMetadata("competitionId", String.valueOf(competitionId))
          .putMetadata("userId", String.valueOf(userId))
          .putMetadata("userEmail", user.getEmail())
          .putMetadata("defaultCountry", stripeDefaultCountry);

      if (comp.getPaymentMode() == PaymentMode.STRIPE) {
        if (applicationFeeAmountCents > 0) {
          paramsBuilder.setApplicationFeeAmount(applicationFeeAmountCents);
        }
        paramsBuilder.setTransferData(PaymentIntentCreateParams.TransferData.builder()
            .setDestination(comp.getStripeDestinationAccountId())
            .build());
      }

      PaymentIntent intent = PaymentIntent.create(paramsBuilder.build());

      Payment payment = new Payment(user, comp, intent.getId(), (int) chargeAmountCents, stripeCurrency);
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
          comp.isPassFeeToParticipant(),
          applicationFeeAmountCents > 0,
          effectivePlatformFeeBps(),
          applicationFeeAmountCents,
          organiserNetCents
      );

    } catch (StripeException e) {
      log.error("Stripe error creating PaymentIntent: {}", e.getMessage());
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
          "Payment service error: " + e.getMessage());
    }
  }

  /**
   * Creates a public demo Stripe Checkout Session for reviewers.
   */
  public String createDemoCheckoutSession() {
    ensureConfigured();
    Stripe.apiKey = stripeSecretKey;

    try {
      SessionCreateParams params = SessionCreateParams.builder()
          .setMode(SessionCreateParams.Mode.PAYMENT)
          .setSuccessUrl(stripeDemoSuccessUrl)
          .setCancelUrl(stripeDemoCancelUrl)
          .setLocale(SessionCreateParams.Locale.EN)
          .setBillingAddressCollection(SessionCreateParams.BillingAddressCollection.AUTO)
          .setCustomerCreation(SessionCreateParams.CustomerCreation.ALWAYS)
          .addLineItem(SessionCreateParams.LineItem.builder()
              .setQuantity(1L)
              .setPriceData(SessionCreateParams.LineItem.PriceData.builder()
                  .setCurrency(stripeCurrency)
                  .setUnitAmount(100L) // €1.00 demo
                  .setProductData(SessionCreateParams.LineItem.PriceData.ProductData.builder()
                      .setName("LastManStanding demo: entry fee (test)")
                      .build())
                  .build())
              .build())
          .build();

      Session session = Session.create(params);
      return session.getUrl();
    } catch (StripeException e) {
      log.error("Stripe error creating Checkout Session: {}", e.getMessage());
      throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Payment service error: " + e.getMessage());
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
      ensureParticipantForPayment(payment);
      paymentRepository.save(payment);
      competitionCacheService.evictCompetition(payment.getCompetition().getId());

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
    EventDataObjectDeserializer deserializer = event.getDataObjectDeserializer();
    StripeObject obj = deserializer.getObject().orElse(null);
    if (obj == null) {
      // API-version mismatches can prevent safe model binding; fallback keeps webhook processing working.
      try {
        obj = deserializer.deserializeUnsafe();
      } catch (EventDataObjectDeserializationException ex) {
        log.warn("Skipping Stripe event {} with unsupported payload shape: {}", type, ex.getMessage());
      }
    }
    if (obj == null) {
      log.warn("Skipping Stripe event {} with missing data object", type);
      return;
    }

    switch (type) {
      case "account.updated" -> {
        if (obj instanceof Account account) {
          handleAccountUpdated(account);
        } else {
          log.warn("Skipping Stripe event {} due to unexpected payload type {}", type, obj.getClass().getSimpleName());
        }
      }
      case "checkout.session.completed" -> {
        if (obj instanceof Session session) {
          handleCheckoutSessionCompleted(session);
        } else {
          log.warn("Skipping Stripe event {} due to unexpected payload type {}", type, obj.getClass().getSimpleName());
        }
      }
      case "payment_intent.succeeded" -> {
        if (obj instanceof PaymentIntent paymentIntent) {
          handlePaymentIntentSucceeded(paymentIntent);
        } else {
          log.warn("Skipping Stripe event {} due to unexpected payload type {}", type, obj.getClass().getSimpleName());
        }
      }
      case "payment_intent.payment_failed" -> {
        if (obj instanceof PaymentIntent paymentIntent) {
          handlePaymentIntentFailed(paymentIntent);
        } else {
          log.warn("Skipping Stripe event {} due to unexpected payload type {}", type, obj.getClass().getSimpleName());
        }
      }
      default -> {
        if ("charge.refunded".equals(type)) {
          if (obj instanceof Charge charge) {
            handleChargeRefunded(charge);
          } else {
            log.warn("Skipping Stripe event {} due to unexpected payload type {}", type, obj.getClass().getSimpleName());
          }
        }
      }
    }
  }

  private void handleCheckoutSessionCompleted(Session session) {
    if (session.getMetadata() == null
        || !"competition_slot".equals(session.getMetadata().get("type"))) {
      return; // not a competition-slot purchase — ignore
    }
    String clubIdRaw = session.getMetadata().get("clubId");
    if (clubIdRaw == null || clubIdRaw.isBlank()) {
      log.warn("competition_slot checkout {} missing clubId metadata", session.getId());
      return;
    }
    Integer amount = session.getAmountTotal() != null ? session.getAmountTotal().intValue() : null;
    billingService.creditSlotForCompletedSession(
        session.getId(), Long.valueOf(clubIdRaw), amount, session.getCurrency());
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
      ensureParticipantForPayment(payment);
      paymentRepository.save(payment);
      competitionCacheService.evictCompetition(payment.getCompetition().getId());
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
      competitionCacheService.evictCompetition(payment.getCompetition().getId());
    });
  }


  private CompetitionParticipant ensureParticipantForPayment(Payment payment) {
    if (payment.getParticipant() != null) {
      return payment.getParticipant();
    }
    CompetitionParticipant participant = competitionService.joinCompetition(
        payment.getCompetition().getId(),
        payment.getUser().getId()
    );
    payment.setParticipant(participant);
    return participant;
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

  private long calculatePlatformFeeCents(long chargeAmountCents) {
    int effectiveBps = effectivePlatformFeeBps();
    if (!stripePlatformFeeEnabled || effectiveBps <= 0 || chargeAmountCents <= 0) {
      return 0;
    }
    long fee = Math.round(chargeAmountCents * (effectiveBps / 10_000.0));
    return Math.min(chargeAmountCents, Math.max(0, fee));
  }

  private int effectivePlatformFeeBps() {
    if (stripePlatformFeePercent > 0) {
      return Math.min(10_000, Math.max(0, (int) Math.round(stripePlatformFeePercent * 100)));
    }
    return Math.min(10_000, Math.max(0, stripePlatformFeeBps));
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

  public record FeeEstimate(long processingCents, long taxCents, long totalFeeCents, long netCents) {
  }

  public record PaymentIntentResponse(
      String clientSecret,
      String paymentIntentId,
      long amountCents,
      long entryFeeCents,
      long estimatedProcessingFeeCents,
      long estimatedTaxCents,
      long estimatedNetCents,
      boolean feePassedToParticipant,
      boolean platformFeeEnabled,
      int platformFeeBps,
      long platformFeeCents,
      long estimatedOrganiserNetAfterPlatformFeeCents
  ) {
  }

  public record ConnectOnboardingResponse(String stripeAccountId, String onboardingUrl) {
  }

  public record ConnectStatusResponse(
      String stripeAccountId,
      boolean onboardingComplete,
      boolean chargesEnabled,
      boolean payoutsEnabled
  ) {
  }

  public record DashboardLinkResponse(String url) {
  }
}
