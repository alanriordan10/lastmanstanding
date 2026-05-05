package com.lastmanstanding.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "payments")
public class Payment {

    public enum PaymentStatus { PENDING, SUCCEEDED, FAILED, REFUNDED }

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "competition_id", nullable = false)
    private Competition competition;

    @Column(name = "stripe_payment_intent_id", unique = true)
    private String stripePaymentIntentId;

    @Column(name = "amount_cents", nullable = false)
    private int amountCents;

    @Column(name = "currency", nullable = false)
    private String currency = "eur";

    @Column(name = "stripe_charge_id")
    private String stripeChargeId;

    @Column(name = "stripe_transfer_id")
    private String stripeTransferId;

    @Column(name = "application_fee_amount_cents")
    private Integer applicationFeeAmountCents;

    @Column(name = "destination_account_id")
    private String destinationAccountId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private PaymentStatus status = PaymentStatus.PENDING;

    @Column(name = "webhook_confirmed", nullable = false)
    private boolean webhookConfirmed = false;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    public Payment() {}

    public Payment(User user, Competition competition, String stripePaymentIntentId, int amountCents, String currency) {
        this.user = user;
        this.competition = competition;
        this.stripePaymentIntentId = stripePaymentIntentId;
        this.amountCents = amountCents;
        this.currency = currency;
    }

    @PrePersist
    protected void onCreate() {
        this.createdAt = LocalDateTime.now();
        this.updatedAt = LocalDateTime.now();
    }

    @PreUpdate
    protected void onUpdate() {
        this.updatedAt = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public User getUser() { return user; }
    public Competition getCompetition() { return competition; }
    public String getStripePaymentIntentId() { return stripePaymentIntentId; }
    public int getAmountCents() { return amountCents; }
    public String getCurrency() { return currency; }
    public String getStripeChargeId() { return stripeChargeId; }
    public void setStripeChargeId(String stripeChargeId) { this.stripeChargeId = stripeChargeId; }
    public String getStripeTransferId() { return stripeTransferId; }
    public void setStripeTransferId(String stripeTransferId) { this.stripeTransferId = stripeTransferId; }
    public Integer getApplicationFeeAmountCents() { return applicationFeeAmountCents; }
    public void setApplicationFeeAmountCents(Integer applicationFeeAmountCents) { this.applicationFeeAmountCents = applicationFeeAmountCents; }
    public String getDestinationAccountId() { return destinationAccountId; }
    public void setDestinationAccountId(String destinationAccountId) { this.destinationAccountId = destinationAccountId; }
    public PaymentStatus getStatus() { return status; }
    public void setStatus(PaymentStatus status) { this.status = status; }
    public boolean isWebhookConfirmed() { return webhookConfirmed; }
    public void setWebhookConfirmed(boolean webhookConfirmed) { this.webhookConfirmed = webhookConfirmed; }
    public LocalDateTime getCreatedAt() { return createdAt; }
}
