import SeoMeta from '../components/SeoMeta';

export default function DemoCheckoutPage() {
  return (
    <div className="max-w-xl mx-auto px-4 py-16 text-gray-200">
      <SeoMeta title="Demo Checkout Unavailable | Last Man Standing" description="Demo checkout is not currently available." canonicalPath="/demo-checkout" />
      <h1 className="text-3xl font-black mb-4">Demo checkout unavailable</h1>
      <p className="text-sm text-gray-300">Online competition payments are not currently offered. Organisers can use free competitions or manual payment tracking.</p>
    </div>
  );
}
