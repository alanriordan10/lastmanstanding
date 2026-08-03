import { useState } from 'react';
import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';
import api from '../api';

export default function DemoCheckoutPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startDemo = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post('/payments/demo-checkout');
      const url = res.data.url;
      if (url) window.location.href = url;
      else setError('No checkout URL returned by server');
    } catch (err: any) {
      setError(err.response?.data?.message ?? err.message ?? 'Failed to start demo checkout');
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-gray-200">
      <SeoMeta title="Demo Checkout" description="Demo Stripe Checkout for LastManStanding" canonicalPath="/demo-checkout" />
      <h1 className="text-3xl font-black mb-4">Demo Stripe Checkout</h1>
      <p className="mb-6 text-sm text-gray-300">This demo opens a Stripe hosted Checkout (test mode) so reviewers can see where payments occur. The demo charge is €1.00 (test).</p>
      <div className="space-y-4">
        <button onClick={startDemo} disabled={loading} className="btn-primary">
          {loading ? 'Opening checkout…' : 'Open demo Checkout (€1.00)'}
        </button>
        <Link to="/services" className="btn-secondary">Back to services</Link>
        {error ? <div className="text-red-400 text-sm">{error}</div> : null}
      </div>
    </div>
  );
}
