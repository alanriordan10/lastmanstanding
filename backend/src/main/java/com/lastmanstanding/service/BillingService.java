package com.lastmanstanding.service;

import com.lastmanstanding.entity.Club;
import com.lastmanstanding.entity.ClubSlotPurchase;
import com.lastmanstanding.repository.ClubRepository;
import com.lastmanstanding.repository.ClubSlotPurchaseRepository;
import com.stripe.Stripe;
import com.stripe.exception.StripeException;
import com.stripe.model.Customer;
import com.stripe.model.checkout.Session;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.checkout.SessionCreateParams;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;

/**
 * Competition-slot pricing model: every club gets ONE free competition (lifetime);
 * each additional competition requires a purchased slot credit (one-time fee paid to
 * the platform Stripe account).
 *
 * The free entitlement is tracked by a persistent {@code free_competition_used} flag
 * on the club so that deleting the first competition does not re-grant a free one.
 */
@Service
public class BillingService {

    private static final Logger log = LoggerFactory.getLogger(BillingService.class);

    private final ClubRepository clubRepository;
    private final ClubSlotPurchaseRepository slotPurchaseRepository;

    @Value("${stripe.secret-key:}")
    private String stripeSecretKey;

    @Value("${stripe.slot.price-id:${STRIPE_SLOT_PRICE_ID:}}")
    private String slotPriceId;

    @Value("${stripe.slot.success-url:${STRIPE_SLOT_SUCCESS_URL:http://localhost:5173/club-admin?billing=success}}")
    private String slotSuccessUrl;

    @Value("${stripe.slot.cancel-url:${STRIPE_SLOT_CANCEL_URL:http://localhost:5173/club-admin?billing=cancel}}")
    private String slotCancelUrl;

    @Value("${stripe.currency:eur}")
    private String stripeCurrency;

    @Value("${stripe.default-country:IE}")
    private String stripeDefaultCountry;

    public BillingService(ClubRepository clubRepository,
                          ClubSlotPurchaseRepository slotPurchaseRepository) {
        this.clubRepository = clubRepository;
        this.slotPurchaseRepository = slotPurchaseRepository;
    }

    /** Snapshot of a club's competition-creation entitlement. */
    public record BillingStatus(
            boolean freeCompetitionUsed,
            int paidCredits,
            boolean canCreateNow,
            boolean paymentRequired
    ) {}

    @Transactional(readOnly = true)
    public BillingStatus getStatus(Long clubId) {
        Club club = requireClub(clubId);
        boolean freeUsed = club.isFreeCompetitionUsed();
        int credits = club.getPaidCompetitionCredits();
        boolean canCreate = !freeUsed || credits > 0;
        return new BillingStatus(freeUsed, credits, canCreate, freeUsed && credits <= 0);
    }

    /**
     * Returns true if this creation consumes the free lifetime slot (no credit needed),
     * false if it will consume a paid credit. Throws 402 if no entitlement.
     */
    @Transactional(readOnly = true)
    public boolean checkCanCreateReturningIsFree(Long clubId) {
        Club club = requireClub(clubId);
        if (!club.isFreeCompetitionUsed()) {
            return true;
        }
        if (club.getPaidCompetitionCredits() <= 0) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED,
                    "Your club's free competition has been used. Purchase a competition slot to create another.");
        }
        return false;
    }

    /** Marks the club's one-time free competition as used (persistent, survives deletion). */
    @Transactional
    public void markFreeCompetitionUsed(Long clubId) {
        Club club = requireClub(clubId);
        if (!club.isFreeCompetitionUsed()) {
            club.setFreeCompetitionUsed(true);
            clubRepository.save(club);
        }
    }

    /** Consumes one paid credit after a paid (non-free) competition has been created. */
    @Transactional
    public void consumePaidCredit(Long clubId) {
        Club club = requireClub(clubId);
        if (club.getPaidCompetitionCredits() <= 0) {
            throw new ResponseStatusException(HttpStatus.PAYMENT_REQUIRED, "No competition-slot credits available");
        }
        club.setPaidCompetitionCredits(club.getPaidCompetitionCredits() - 1);
        clubRepository.save(club);
    }

    /** Creates a Stripe Checkout Session to buy one competition-slot credit (paid to the platform account). */
    @Transactional
    public String createSlotCheckoutSession(Long clubId) {
        Club club = requireClub(clubId);
        if (stripeSecretKey == null || stripeSecretKey.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Billing is not configured");
        }
        if (slotPriceId == null || slotPriceId.isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Competition-slot price is not configured (STRIPE_SLOT_PRICE_ID)");
        }
        Stripe.apiKey = stripeSecretKey;
        try {
            CustomerCreateParams customerParams = CustomerCreateParams.builder()
                    .setAddress(CustomerCreateParams.Address.builder()
                            .setCountry(stripeDefaultCountry)
                            .build())
                    .putMetadata("clubId", String.valueOf(club.getId()))
                    .build();
            Customer customer = Customer.create(customerParams);

            SessionCreateParams params = SessionCreateParams.builder()
                    .setMode(SessionCreateParams.Mode.PAYMENT)
                    .setSuccessUrl(slotSuccessUrl)
                    .setCancelUrl(slotCancelUrl)
                    .setLocale(SessionCreateParams.Locale.EN)
                    .setBillingAddressCollection(SessionCreateParams.BillingAddressCollection.REQUIRED)
                    .setCustomer(customer.getId())
                    .addLineItem(SessionCreateParams.LineItem.builder()
                            .setQuantity(1L)
                            .setPrice(slotPriceId)
                            .build())
                    .putMetadata("type", "competition_slot")
                    .putMetadata("clubId", String.valueOf(club.getId()))
                    .putMetadata("defaultCountry", stripeDefaultCountry)
                    .build();
            Session session = Session.create(params);

            ClubSlotPurchase purchase = new ClubSlotPurchase(
                    club, session.getId(),
                    session.getAmountTotal() != null ? session.getAmountTotal().intValue() : 0,
                    session.getCurrency() != null ? session.getCurrency() : stripeCurrency);
            slotPurchaseRepository.save(purchase);

            return session.getUrl();
        } catch (StripeException e) {
            log.error("Stripe error creating competition-slot checkout for club {}: {}", clubId, e.getMessage());
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Payment service error: " + e.getMessage());
        }
    }

    /**
     * Idempotently credits a club with one competition slot after a successful checkout.
     */
    @Transactional
    public void creditSlotForCompletedSession(String sessionId, Long clubId, Integer amountTotal, String currency) {
        ClubSlotPurchase purchase = slotPurchaseRepository.findByStripeSessionId(sessionId).orElse(null);
        if (purchase != null && purchase.getStatus() == ClubSlotPurchase.Status.COMPLETED) {
            return; // already processed — idempotent
        }
        Club club = requireClub(clubId);
        if (purchase == null) {
            purchase = new ClubSlotPurchase(club, sessionId,
                    amountTotal != null ? amountTotal : 0,
                    currency != null ? currency : stripeCurrency);
        }
        purchase.setStatus(ClubSlotPurchase.Status.COMPLETED);
        purchase.setCompletedAt(LocalDateTime.now());
        slotPurchaseRepository.save(purchase);

        club.setPaidCompetitionCredits(club.getPaidCompetitionCredits() + 1);
        clubRepository.save(club);
        log.info("Credited club {} with 1 competition slot (session {})", clubId, sessionId);
    }

    private Club requireClub(Long clubId) {
        return clubRepository.findById(clubId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Club not found"));
    }
}
