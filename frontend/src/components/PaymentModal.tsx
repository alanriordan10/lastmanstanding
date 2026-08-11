import { useState, useEffect } from 'react';
import { loadStripe } from '@stripe/stripe-js';
import {
  Elements,
  PaymentElement,
  useStripe,
  useElements,
} from '@stripe/react-stripe-js';
import api from '../api';
import type { Competition } from '../types';
import toast from 'react-hot-toast';

// ── Types ────────────────────────────────────────────────────────────

interface PaymentModalProps {
  competition: Competition;
  onSuccess: () => void;
  onClose: () => void;
}

// ── Stripe appearance ─────────────────────────────────────────────────

const stripeAppearance = {
  theme: 'night' as const,
  variables: {
    colorPrimary: '#6366f1',
    colorBackground: '#1e1e2e',
    colorText: '#e2e8f0',
    colorDanger: '#f87171',
    fontFamily: 'ui-sans-serif, system-ui, sans-serif',
    borderRadius: '8px',
  },
};

function fmt(cents: number) {
  return `€${(cents / 100).toFixed(2)}`;
}

type FeeBreakdown = {
  amountCents: number;
  processingCents: number;
  taxCents: number;
  netCents: number;
  feePassedToParticipant: boolean;
  platformFeeEnabled: boolean;
  platformFeeBps: number;
  platformFeeCents: number;
  organiserNetAfterPlatformFeeCents: number;
};

// ── Inner form (has access to Stripe hooks) ───────────────────────────

function CheckoutForm({
  competition,
  onSuccess,
  onClose,
  feeBreakdown,
}: {
  competition: Competition;
  onSuccess: () => void;
  onClose: () => void;
  feeBreakdown: FeeBreakdown | null;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const entryFeeCents = Math.round(competition.entryFee * 100);
  const chargeAmount = feeBreakdown ? (feeBreakdown.amountCents / 100).toFixed(2) : competition.entryFee.toFixed(2);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setIsProcessing(true);
    setErrorMessage(null);

    // Step 1: Validate the Payment Element form fields first
    const { error: submitError } = await elements.submit();
    if (submitError) {
      setErrorMessage(submitError.message ?? 'Please check your payment details');
      setIsProcessing(false);
      return;
    }

    // Step 2: Confirm the payment with Stripe
    // return_url is required when automatic_payment_methods is enabled
    const { error, paymentIntent } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: {
        return_url: window.location.href,
      },
    });

    if (error) {
      // Card errors, validation errors etc.
      setErrorMessage(error.message ?? 'Payment failed. Please try again.');
      setIsProcessing(false);
      return;
    }

    if (paymentIntent?.status === 'succeeded') {
      // Step 3: Notify backend to verify and join competition
      try {
        await api.post(`/payments/competitions/${competition.id}/confirm`, {
          paymentIntentId: paymentIntent.id,
        });
        setSuccessMessage(`Payment successful. Receipt ${paymentIntent.id}. Finalising your entry...`);
        toast.success('Payment complete. You are now entered.');
        onSuccess();
      } catch (err: any) {
        setErrorMessage(err.response?.data?.message ?? 'Payment succeeded but failed to join. Please contact support.');
        setIsProcessing(false);
      }
    } else if (paymentIntent?.status === 'requires_action') {
      // 3D Secure etc. — Stripe handles the redirect automatically via return_url
      setErrorMessage('Additional authentication required. Please follow the instructions from your bank.');
      setIsProcessing(false);
    } else {
      setErrorMessage(`Payment not completed (status: ${paymentIntent?.status ?? 'unknown'}). Please try again.`);
      setIsProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Order summary */}
      <div className="rounded-lg bg-surface-700/60 border border-gray-700 p-4 space-y-3">
        <div className="flex justify-between items-start">
          <div>
            <p className="text-xs text-gray-400 uppercase tracking-wide">Entry fee</p>
            <p className="font-semibold text-gray-100 mt-0.5">{competition.name}</p>
          </div>
          <p className="text-2xl font-bold text-brand-400">€{chargeAmount}</p>
        </div>

        {feeBreakdown && (
          <>
            <div className="border-t border-gray-700/60 pt-3 space-y-1.5 text-xs">
              {feeBreakdown.feePassedToParticipant ? (
                <>
                  <div className="flex justify-between text-gray-300">
                    <span>Entry fee</span>
                    <span>{fmt(entryFeeCents)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Stripe fee <span className="text-gray-500">(est.)</span></span>
                    <span>+ {fmt(feeBreakdown.processingCents)}</span>
                  </div>
                  <div className="flex justify-between text-gray-400">
                    <span>Tax on fee <span className="text-gray-500">(est.)</span></span>
                    <span>+ {fmt(feeBreakdown.taxCents)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-200 border-t border-gray-700/60 pt-1.5 mt-1.5">
                    <span>You are charged</span>
                    <span className="text-brand-400">{fmt(feeBreakdown.amountCents)}</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex justify-between text-gray-300">
                    <span>Entry amount</span>
                    <span>{fmt(feeBreakdown.amountCents)}</span>
                  </div>
                  <div className="flex justify-between font-semibold text-gray-200 border-t border-gray-700/60 pt-1.5 mt-1.5">
                    <span>You are charged</span>
                    <span className="text-brand-400">{fmt(feeBreakdown.amountCents)}</span>
                  </div>
                </>
              )}
            </div>
            {feeBreakdown.feePassedToParticipant ? <p className="text-xs text-gray-500 italic">Processing fee estimates may vary by card type.</p> : null}
          </>
        )}
      </div>

      {/* Stripe Payment Element — handles card, Google Pay, Apple Pay automatically */}
      <div>
        <PaymentElement
          options={{
            layout: 'tabs',
            defaultValues: {
              billingDetails: {
                address: {
                  country: 'IE',
                },
              },
            },
          }}
        />
      </div>

      <p className="-mt-2 text-xs text-gray-500">
        Payments are processed in euro, with Ireland preselected for billing details.
      </p>

      {errorMessage && (
        <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
          {errorMessage}
        </div>
      )}
      {successMessage && (
        <div className="rounded-lg bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-300">
          {successMessage}
        </div>
      )}

      <div className="flex gap-3 sticky bottom-0 bg-surface-800 pt-3 pb-1">
        <button
          type="submit"
          disabled={!stripe || !elements || isProcessing}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {isProcessing ? (
            <>
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              Processing…
            </>
          ) : (
            <>
              🔒 Pay €{chargeAmount} & Join
            </>
          )}
        </button>
        <button
          type="button"
          onClick={onClose}
          disabled={isProcessing}
          className="btn-secondary px-4"
        >
          Cancel
        </button>
      </div>

      <p className="text-center text-xs text-gray-500">
        Secured by{' '}
        <span className="font-semibold text-gray-400">Stripe</span>
        {' '}· Google Pay & Apple Pay supported
      </p>
    </form>
  );
}

// ── Outer modal — loads Stripe and creates PaymentIntent ─────────────

export default function PaymentModal({ competition, onSuccess, onClose }: PaymentModalProps) {
  const [stripePromise, setStripePromise] = useState<ReturnType<typeof loadStripe> | null>(null);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feeBreakdown, setFeeBreakdown] = useState<FeeBreakdown | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const publishableKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
        if (!publishableKey || publishableKey.startsWith('pk_test_your')) {
          throw new Error('Stripe is not configured. Set VITE_STRIPE_PUBLISHABLE_KEY in frontend/.env and restart the dev server.');
        }

        const [stripe, intentRes] = await Promise.all([
          loadStripe(publishableKey),
          api.post(`/payments/competitions/${competition.id}/intent`),
        ]);

        setStripePromise(Promise.resolve(stripe));
        setClientSecret(intentRes.data.clientSecret);
        setFeeBreakdown({
          amountCents: intentRes.data.amountCents,
          processingCents: intentRes.data.estimatedProcessingFeeCents,
          taxCents: intentRes.data.estimatedTaxCents,
          netCents: intentRes.data.estimatedNetCents,
          feePassedToParticipant: intentRes.data.feePassedToParticipant ?? false,
          platformFeeEnabled: intentRes.data.platformFeeEnabled ?? false,
          platformFeeBps: intentRes.data.platformFeeBps ?? 0,
          platformFeeCents: intentRes.data.platformFeeCents ?? 0,
          organiserNetAfterPlatformFeeCents: intentRes.data.estimatedOrganiserNetAfterPlatformFeeCents ?? intentRes.data.estimatedNetCents,
        });
      } catch (err: any) {
        setError(err.response?.data?.message ?? err.message ?? 'Failed to initialise payment');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, [competition.id]);

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-label={`Pay entry fee for ${competition.name}`}
    >
      <div className="w-full max-w-md rounded-2xl bg-surface-800 border border-gray-700/50 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/50 shrink-0">
          <h2 className="text-lg font-bold">Join Competition</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="px-6 py-5 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center py-10 gap-3">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
              <p className="text-sm text-gray-400">Initialising secure payment…</p>
            </div>
          ) : error ? (
            <div className="space-y-4">
              <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
              <button onClick={onClose} className="btn-secondary w-full">Close</button>
            </div>
          ) : stripePromise && clientSecret ? (
            <Elements
              stripe={stripePromise}
              options={{ clientSecret, appearance: stripeAppearance }}
            >
              <CheckoutForm
                competition={competition}
                onSuccess={onSuccess}
                onClose={onClose}
                feeBreakdown={feeBreakdown}
              />
            </Elements>
          ) : null}
        </div>
      </div>
    </div>
  );
}
