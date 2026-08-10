import SeoMeta from '../components/SeoMeta';

export default function PaymentSetupReturnPage() {
  return (
    <div className="mx-auto max-w-xl px-4 py-16 text-gray-200">
      <SeoMeta title="Payment Setup Unavailable | Last Man Standing" description="Online payment setup is not currently available." canonicalPath="/stripe-connect/return" />
      <div className="card space-y-3 text-center">
        <p className="text-xs font-black uppercase tracking-[0.22em] text-brand-200">Payment setup</p>
        <h1 className="text-2xl font-black text-white">Online payment setup is unavailable</h1>
        <p className="text-sm leading-6 text-gray-300">Club admins can create free competitions or track manual payments collected outside the app.</p>
      </div>
    </div>
  );
}
