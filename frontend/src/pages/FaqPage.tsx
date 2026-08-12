import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

const FAQ_SECTIONS = [
  {
    title: 'Platform & Access',
    items: [
      {
        q: 'Where can I use Last Man Standing?',
        a: 'Last Man Standing is available as a web app at www.runlastmanstanding.com and as a native Android app on Google Play (https://play.google.com/store/apps/details?id=com.lastmanstanding.app). Both are fully functional and kept in sync.',
      },
      {
        q: 'Do I need to install anything to use the app?',
        a: 'No. The web app works in any modern browser on any device — phone, tablet, or desktop — with no install required. If you prefer a native experience on Android, download the app from Google Play: https://play.google.com/store/apps/details?id=com.lastmanstanding.app',
      },
      {
        q: 'I have an iPhone. Can I still use Last Man Standing?',
        a: 'Yes. The web app at www.runlastmanstanding.com is fully supported on iPhone and iPad. Open it in Safari or Chrome and you will have the full picking experience. An iOS native app is not available at this time, but the web app covers all the same features.',
      },
      {
        q: 'Are the web app and Android app interchangeable?',
        a: 'Yes, completely. They share the same account and the same data. You can pick on the web one day and check results on Android the next — everything stays in sync.',
      },
      {
        q: 'Which should I recommend to players in my competition?',
        a: 'For Android users, recommend the Google Play app (https://play.google.com/store/apps/details?id=com.lastmanstanding.app) for the smoothest native experience. For iPhone users or anyone who prefers not to install an app, recommend the web app at www.runlastmanstanding.com. Both work identically for picking teams, viewing results, and checking standings.',
      },
      {
        q: "Can I add the web app to my phone's home screen?",
        a: 'Yes. On most browsers (Chrome on Android, Safari on iPhone) you can tap "Add to Home Screen" or "Install App" to pin the web app as a shortcut. It will behave much like a native app without going through an app store.',
      },
    ],
  },
  {
    title: 'Player Rules',
    items: [
      {
        q: 'How does a last man standing competition work?',
        a: 'Each entry picks one team per gameweek. A win advances the entry. A loss eliminates the entry. Draw handling depends on competition settings, including whether lifeline is enabled and used for that entry.',
      },
      {
        q: 'What are the core rules in every competition?',
        a: 'Each entry must pick one eligible team per gameweek before lock. You cannot reuse a team already used by that same entry. A win advances the entry and a loss eliminates it. Draw outcomes follow the competition configuration (including lifeline rules).',
      },
      {
        q: 'How many picks can I submit per gameweek?',
        a: 'One pick per entry per gameweek. If you have multiple entries, each entry can submit its own pick.',
      },
      {
        q: 'Can I change my pick after submitting it?',
        a: 'Yes, until the gameweek lock time. After lock, picks are frozen and cannot be changed.',
      },
      {
        q: 'When exactly do picks lock?',
        a: 'Picks lock at the configured gameweek lock timestamp for that competition, usually before the first fixture in that gameweek starts.',
      },
      {
        q: 'What happens if I do not make a pick?',
        a: 'This depends on competition setup. Some competitions eliminate missed picks; others can support an automatic assignment mode depending on admin configuration.',
      },
      {
        q: 'Can users enter a competition more than once?',
        a: 'Yes. Club admins can configure maximum entries per user. Each entry is tracked separately across picks, lifeline usage, and payment status.',
      },
      {
        q: 'How are multiple entries handled?',
        a: 'Each entry is treated independently with its own status, used teams, lifeline usage, elimination week, and payment state.',
      },
      {
        q: 'Can two entries from the same user pick the same team in one gameweek?',
        a: 'Yes, if that team is still unused for each entry. Team reuse checks are tracked per entry, not per user account.',
      },
    ],
  },
  {
    title: 'Lifeline Rules',
    items: [
      {
        q: 'How does the lifeline feature work?',
        a: 'When enabled, each entry can play one lifeline before a gameweek starts. With lifeline active, a draw can keep that entry alive according to competition rules. A loss still eliminates the entry.',
      },
      {
        q: 'When can a lifeline be used?',
        a: 'Only before the gameweek locks. Lifeline cannot be activated after lock.',
      },
      {
        q: 'How many lifelines does each entry get?',
        a: 'At most one lifeline per entry, and only in competitions where lifeline is enabled.',
      },
      {
        q: 'Does lifeline protect against a losing pick?',
        a: "No. Lifeline does not save an entry from a loss. It only applies under the competition's configured lifeline behavior for non-losing outcomes.",
      },
    ],
  },
  {
    title: 'Payments and Entries',
    items: [
      {
        q: 'Can we collect entry fees in the app?',
        a: 'Yes. Competitions can use manual payment tracking. Payment status is managed per entry so multi-entry players are handled correctly.',
      },
      {
        q: 'What payment modes are supported?',
        a: 'Free competitions or manual payment tracking. The mode is configured per competition by the admin.',
      },
      {
        q: 'Can a user have one paid entry and one unpaid entry?',
        a: 'Yes. Payment status is tracked per entry, so each entry can be paid or awaiting payment independently.',
      },
      {
        q: 'What does strict manual payment policy mean?',
        a: 'Strict manual policy requires admin confirmation of payment status for entries in manual-payment competitions.',
      },
    ],
  },
  {
    title: 'Competition Slots',
    items: [
      {
        q: 'How much does it cost to run a competition?',
        a: 'Every club gets its first competition free. After that, each additional competition requires one competition slot credit, purchased once-off through Stripe Checkout from the Club Admin page.',
      },
      {
        q: 'What is a competition slot?',
        a: 'A competition slot is a credit that allows a club admin to create one additional competition. Slots do not expire, and one slot is consumed each time a competition is created after your free competition has been used.',
      },
      {
        q: 'Is the free competition per year or once only?',
        a: 'Once only. The free competition is a lifetime allowance per club, not a recurring yearly credit. Once it is used it is not restored, even if the competition is completed or deleted.',
      },
      {
        q: 'How do I buy a competition slot?',
        a: 'Go to Club Admin, find the Competition Slots card and select "Buy competition slot". You are taken to Stripe Checkout to pay securely by card. When payment succeeds you are returned to Club Admin and your credit balance updates automatically.',
      },
      {
        q: 'Can I buy several slots in advance?',
        a: 'Yes. You can purchase slots whenever you like and they accumulate on your club balance, so you can stock up before a busy season.',
      },
      {
        q: 'Why am I being told payment is required when I try to create a competition?',
        a: 'That means your club has already used its free competition and has no remaining slot credits. Buy a competition slot from the Club Admin page and then create the competition again.',
      },
      {
        q: 'Is the slot fee the same as player entry fees?',
        a: "No. The competition slot fee is a platform fee paid to Last Man Standing for creating a competition. Player entry fees are collected separately by your club under the competition's payment mode.",
      },
      {
        q: 'What happens if I cancel at the Stripe payment screen?',
        a: 'Nothing is charged and no credit is added. You are returned to the Club Admin page with a message confirming that checkout was cancelled, and you can try again at any time.',
      },
      {
        q: 'Does buying a slot work the same on mobile?',
        a: 'Yes. On the mobile app the "Buy competition slot" button opens Stripe Checkout in your browser and returns you straight back to the Club Admin screen when payment completes or is cancelled.',
      },
      {
        q: 'Do I get a slot back if I delete a competition?',
        a: 'No. A slot credit is consumed at the moment a competition is created and is not refunded if the competition is later deleted or abandoned.',
      },
    ],
  },
  {
    title: 'Gameweek and Admin Rules',
    items: [
      {
        q: 'When do picks lock?',
        a: 'Picks lock at the configured gameweek lock time, usually before the first fixture starts.',
      },
      {
        q: 'Can a team be picked more than once?',
        a: 'No. Standard survivor rules apply: once a team is used by an entry, that entry cannot use the same team again.',
      },
      {
        q: 'What happens with postponed or cancelled fixtures?',
        a: 'Outcome handling follows competition processing rules. Depending on admin settings and gameweek processing, postponed/cancelled outcomes can be treated differently from regular losses.',
      },
      {
        q: 'What is a gameweek bye and when is it granted?',
        a: 'A bye can be granted by processing rules when needed to keep the competition fair, for example in edge-case elimination scenarios. When granted, affected entries advance.',
      },
      {
        q: 'How are results revealed?',
        a: 'After lock, all selections can be viewed. Results are shown as fixtures complete and are finalized once gameweek processing is complete.',
      },
      {
        q: 'What statuses can an entry have?',
        a: 'Typical statuses are ACTIVE, ELIMINATED, and WINNER. Active entries continue picking; eliminated entries stop; winner indicates competition completion.',
      },
      {
        q: 'Can admins remove participants or declare winners manually?',
        a: 'Yes. Club admins can manage participants and, where allowed by rules and workflow, declare competition winners from admin tools.',
      },
      {
        q: 'Can competitions be public or private?',
        a: 'Yes. Competitions can be configured as public or private, with join behavior controlled by admin settings and join links/codes.',
      },
    ],
  },
];

export default function FaqPage() {
  const faqItems = FAQ_SECTIONS.flatMap((section) => section.items);
  const faqSchema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map((item) => ({
      '@type': 'Question',
      name: item.q,
      acceptedAnswer: {
        '@type': 'Answer',
        text: item.a,
      },
    })),
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#070f22_0%,#0a1731_58%,#0a1730_100%)] px-4 py-10 text-white">
      <SeoMeta
        title="Last Man Standing App FAQ | Rules, Lifeline, Payments, Results"
        description="Answers to common questions about survivor pool rules, lifeline usage, payment modes, and gameweek results."
        canonicalPath="/faq"
        jsonLd={[faqSchema]}
      />

      <div className="mx-auto max-w-4xl space-y-6">
        <div className="rounded-[1.8rem] border border-white/8 bg-white/[0.03] px-6 py-7 shadow-[0_24px_60px_rgba(2,6,23,0.4)]">
          <Link to="/" className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300 hover:text-brand-200">
            ← Back to home
          </Link>
          <h1 className="mt-3 text-4xl font-black tracking-tight">Frequently Asked Questions</h1>
          <p className="mt-2 text-sm text-gray-300">
            Everything players and club admins ask about running football last man standing competitions.
          </p>
          <Link
            to="/guide"
            className="mt-5 inline-flex rounded-xl border border-brand-300/30 bg-brand-500/15 px-4 py-2 text-sm font-bold text-brand-100 transition hover:bg-brand-500/25"
          >
            Open full user guide
          </Link>
        </div>

        <div className="space-y-6">
          {FAQ_SECTIONS.map((section) => (
            <section key={section.title} className="space-y-3">
              <h2 className="text-xl font-black tracking-tight text-white">{section.title}</h2>
              {section.items.map((item) => (
                <article key={item.q} className="rounded-2xl border border-white/8 bg-white/[0.03] p-5">
                  <h3 className="text-lg font-bold text-white">{item.q}</h3>
                  <p className="mt-2 text-sm leading-6 text-gray-300">{item.a}</p>
                </article>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}






