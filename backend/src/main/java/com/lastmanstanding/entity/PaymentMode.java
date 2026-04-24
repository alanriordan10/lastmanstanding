package com.lastmanstanding.entity;

public enum PaymentMode {
    /** Free competition — no payment required */
    FREE,
    /** Organiser collects payment manually (bank transfer, Revolut, cash etc.) */
    MANUAL,
    /** Online payment via Stripe */
    STRIPE
}
