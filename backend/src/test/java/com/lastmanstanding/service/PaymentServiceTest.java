package com.lastmanstanding.service;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PaymentServiceTest {

    @Test
    void estimateFeesIncludesProcessingFeeAndVat() {
        PaymentService.FeeEstimate fees = PaymentService.estimateFees(1000);

        assertEquals(40, fees.processingCents());
        assertEquals(9, fees.taxCents());
        assertEquals(49, fees.totalFeeCents());
        assertEquals(951, fees.netCents());
    }

    @Test
    void grossUpChargeAmountCoversEntryFeeAfterEstimatedFeesAndVat() {
        long entryFeeCents = 1000;
        long chargeAmountCents = PaymentService.grossUpChargeAmountCents(entryFeeCents);
        PaymentService.FeeEstimate fees = PaymentService.estimateFees(chargeAmountCents);

        assertTrue(chargeAmountCents > entryFeeCents);
        assertTrue(fees.netCents() >= entryFeeCents);
        assertTrue(PaymentService.estimateFees(chargeAmountCents - 1).netCents() < entryFeeCents);
    }
}
