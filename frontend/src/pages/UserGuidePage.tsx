import { Link } from 'react-router-dom';
import SeoMeta from '../components/SeoMeta';

type GuideSection = {
  id: string;
  eyebrow: string;
  title: string;
  summary: string;
  items: Array<{ title: string; points: string[] }>;
};

type OptionRow = { option: string; useWhen: string; notes: string };

const quickLinks = [
  ['For players', '#players'],
  ['Competition slots', '#competition-slots'],
  ['Create competitions', '#create-competition'],
  ['Payments', '#payments'],
  ['Lifeline', '#lifeline'],
  ['Results', '#results'],
  ['Pause and void', '#pause'],
  ['Troubleshooting', '#troubleshooting'],
];

const playerSections: GuideSection[] = [
  {
    id: 'players',
    eyebrow: 'Player walkthrough',
    title: 'Joining, picking, and tracking your entry',
    summary: 'This is the normal member flow for public competitions, private invite codes, picks, lifeline usage, payments, and results.',
    items: [
      {
        title: '1. Sign in or create an account',
        points: [
          'Use the same account on web and mobile. The competitions, picks, payments, and profile settings are shared.',
          'Use email/password or Google sign-in when configured.',
          'Usernames cannot contain spaces. If a username or email is already taken, the sign-up form should show that before you continue.',
          'On the mobile app, biometric login can be enabled from Profile after a successful sign-in.',
        ],
      },
      {
        title: '2. Understand the Competitions page',
        points: [
          'Browse shows competitions that are public or otherwise visible to you.',
          'Join a private competition lets you enter an invite code from the organiser. The code previews the private competition before you join.',
          'My Competitions contains competitions you have entered, split into sections such as Active, Upcoming, Eliminated, and Finished.',
          'Needs Action appears when an entry needs payment, a pick, or another clear next step.',
          'Announcements and activity updates show relevant organiser messages and important account or competition events.',
        ],
      },
      {
        title: '3. Join public or private competitions',
        points: [
          'For public competitions, open the competition card and select the join action.',
          'For private competitions, enter the invite code exactly as given by the organiser. The invite code should not just filter the list; it should preview and join the competition flow.',
          'If the competition is free, you can join immediately.',
          'If manual payment is enabled, your entry may be created but remain awaiting payment until the club admin marks that specific entry as paid.',
        ],
      },
      {
        title: '4. Make a pick',
        points: [
          'Open the competition detail page and expand the open gameweek.',
          'Pick one team before the gameweek lock. The lock is strict and is normally based on the first fixture kickoff in that gameweek.',
          'You can change the pick until lock. After lock, picks are frozen.',
          'A team already used by the same entry in a previous locked or resolved gameweek cannot be selected again.',
          'A team selected in a future gameweek should appear as reserved, so you understand that it is already planned elsewhere.',
          'If you tap or click the team that is already selected, no extra save action should be needed.',
        ],
      },
      {
        title: '5. Read Cards, My Route, results, and survivor table',
        points: [
          'Cards view is best for seeing fixtures, scores, pick share, risk tags, and your selected team.',
          'My Route is best for planning because it shows available, used, picked, and reserved teams for your entry.',
          'View all selections shows everyone who picked each team after selections are visible.',
          'Results shows resolved, advanced, eliminated, pending, and team grouping views where available.',
          'Survivor Table is the official view of who is active, eliminated, winner, lifeline used, and gameweek-by-gameweek pick history.',
        ],
      },
      {
        title: '6. Understand outcome rules',
        points: [
          'A win advances the entry.',
          'A loss eliminates the entry.',
          'A draw only advances when the competition has lifeline enabled and the entry has selected its lifeline for that gameweek.',
          'If a gameweek is voided because the competition was paused over the lock, nobody is eliminated from that gameweek.',
          'If the competition has ended, unused future gameweeks should not be treated as active or require picks.',
        ],
      },
    ],
  },
];

const adminSections: GuideSection[] = [
  {
    id: 'club-setup',
    eyebrow: 'Club admin setup',
    title: 'Create and configure your club',
    summary: 'A club admin can create competitions, invite players, manage entries, configure payments, process results, and send announcements.',
    items: [
      {
        title: '1. Create a club',
        points: [
          'New organiser flow: choose Create a club from the public landing or login page, create an account, then complete club setup.',
          'Existing user flow: choose Create a club, select the existing-account path, sign in, then continue the club creation screen.',
          'After the club is created, the user becomes club admin and the Club Admin navigation becomes available.',
          'A club admin can also be a normal player, so they can run competitions and still enter competitions as a participant when allowed.',
        ],
      },
      {
        title: '2. Complete the setup checklist',
        points: [
          'The setup checklist highlights whether core setup is complete.',
          'Typical setup items are club details, at least one competition, and manual payment readiness if payments are tracked.',
          'Use the checklist as an onboarding aid. It does not replace checking the competition rules before inviting members.',
        ],
      },
      {
        title: '3. Configure club branding',
        points: [
          'Upload or set the club logo so competition pages and the mobile app show the club identity.',
          'Choose primary and accent colours. These should be propagated into competition headings, cards, and related branding areas.',
          'Use colours with enough contrast for mobile screens.',
        ],
      },
      {
        title: '4. Club settings and admin transfer',
        points: [
          'Use Club Settings to review club ownership and transfer club admin access when needed.',
          'Before deleting an account that owns or administers a club, transfer admin responsibility to another user.',
          'Only assign admin access to a trusted organiser because they can manage competitions, payments, participants, and announcements.',
        ],
      },
    ],
  },
  {
    id: 'competition-slots',
    eyebrow: 'Competition slots',
    title: 'Your free competition and buying slot credits',
    summary: 'Every club can create one competition free of charge. Each competition after that consumes one competition slot credit, bought once-off through Stripe Checkout.',
    items: [
      {
        title: '1. How the allowance works',
        points: [
          'Each club gets one free competition. This is a lifetime allowance, not a yearly or monthly reset.',
          'Once the free competition has been created, every further competition requires one competition slot credit.',
          'Creating a competition consumes exactly one credit at the moment it is saved.',
          'Credits do not expire, and they are held at club level so any club admin can use them.',
          'Deleting or completing a competition does not return the free allowance or a spent credit.',
        ],
      },
      {
        title: '2. Where to check your slot status',
        points: [
          'Open Club Admin. The Competition Slots card shows your current position on both web and mobile.',
          'Free competition available means you can create your first competition at no cost.',
          'A credit count means you have that many extra competitions ready to create.',
          'Payment required means the free competition is used and there are no credits left, so + New Competition is blocked until you buy a slot.',
        ],
      },
      {
        title: '3. Buying a competition slot',
        points: [
          'Select Buy competition slot on the Competition Slots card.',
          'On web you are redirected to Stripe Checkout in the browser. On mobile the app opens Stripe Checkout in your browser and returns you to the app afterwards.',
          'Pay securely by card. Last Man Standing never stores your card details; Stripe handles the payment.',
          'On success you return to Club Admin with a confirmation message and the credit balance refreshes automatically.',
          'If you cancel at the payment screen nothing is charged, no credit is added, and you can retry at any time.',
          'You can buy several slots in advance if you plan to run multiple competitions in a season.',
        ],
      },
      {
        title: '4. Slot fees versus player entry fees',
        points: [
          'The competition slot fee is a platform fee paid to Last Man Standing for creating a competition.',
          'Player entry fees are separate and are collected by your club under the competition Payment mode (Free or Manual).',
          'Buying a slot does not change how you collect money from players, and it does not enable online entry-fee collection.',
        ],
      },
      {
        title: '5. If creation is blocked',
        points: [
          'The message "Your club\u2019s free competition has been used. Purchase a competition slot to create another." means you need a credit.',
          'Buy a slot, wait for the balance to update on the Competition Slots card, then create the competition again.',
          'If you paid but the balance has not moved, refresh Club Admin. Stripe confirms the payment to the app in the background, which can take a few seconds.',
        ],
      },
    ],
  },
  {
    id: 'create-competition',
    eyebrow: 'Competition setup',
    title: 'Create a competition, field by field',
    summary: 'The New Competition modal controls visibility, entries, fixture source, payment mode, lifeline rules, and how missed picks are handled.',
    items: [
      {
        title: 'Core details',
        points: [
          'Name: the public name players see on cards, invites, emails, and mobile screens.',
          'Description: optional explanation for rules, payment instructions, prize notes, or organiser context.',
          'Start date: when the competition should begin. Fixtures are synced from this date and grouped into gameweeks based on the selected fixture source.',
          'Prize pool: optional amount displayed to players. This is informational unless your club separately manages payouts.',
        ],
      },
      {
        title: 'Visibility',
        points: [
          'Public: players can discover it in the available or browse competition list, depending on status and eligibility.',
          'Private: players need the invite code or invite link. This is best for club-only competitions or paid member groups.',
          'Invite code: shown in Club Admin. It should be labelled clearly and copyable so admins can share it.',
        ],
      },
      {
        title: 'Entries and rules',
        points: [
          'Max entries per user: controls how many independent entries one account can create in this competition.',
          'If max entries is 1, the UI should avoid showing Entry #1 everywhere because it adds noise.',
          'If a user has multiple entries, each entry has its own picks, lifeline usage, payment status, and elimination state.',
          'Missed pick mode controls what happens when an active entry does not pick before lock. Use ELIMINATE if you want strict survivor rules.',
          'Postponed consumes team controls whether a postponed fixture still consumes the selected team. This should be chosen before launch and explained to players.',
        ],
      },
      {
        title: 'Fixture source',
        points: [
          'The fixture source decides which fixtures are imported and grouped into gameweeks.',
          'Use the default club fixture source unless you have been told another supported source is available.',
          'Changing fixture source after creation may require a resync. Existing gameweeks, picks, and results must be handled carefully.',
          'If fixtures are missing after creating or editing a competition, wait for fixture sync and verify the configured fixture source.',
        ],
      },
      {
        title: 'Status',
        points: [
          'Upcoming means the competition is created but not actively running yet.',
          'Active means picks and gameweek processing are live.',
          'Completed or Finished means the competition has ended.',
          'In most normal flows, admins should not need to manually change status. Status should usually follow competition lifecycle and processing rules.',
        ],
      },
    ],
  },
  {
    id: 'payments',
    eyebrow: 'Payment configuration',
    title: 'Choose the right payment mode',
    summary: 'Payment mode decides whether players can join freely or need manual admin confirmation.',
    items: [
      {
        title: 'Free competitions',
        points: [
          'Use Free when no money is collected through the app.',
          'Players can join without payment confirmation.',
          'Payment status should show Not needed.',
          'This is best for test competitions, social competitions, or competitions where money is handled outside the app and does not need tracking.',
        ],
      },
      {
        title: 'Manual payment competitions',
        points: [
          'Use Manual when players pay by cash, bank transfer, Revolut, or another offline method.',
          'Each entry can be marked paid or reverted individually by the club admin.',
          'This is important for users with multiple entries. Marking one entry as paid should not mark all entries for that user.',
          'Strict manual payment policy means unpaid entries may need admin confirmation before they are treated as fully paid.',
        ],
      },
    ],
  },
  {
    id: 'lifeline',
    eyebrow: 'Optional competition feature',
    title: 'Configure and explain lifelines',
    summary: 'Lifeline adds one strategic safety option per entry. It must be clear because it changes draw handling.',
    items: [
      {
        title: 'Enable lifeline on competition creation',
        points: [
          'Lifeline should be a clear checkbox under Rules.',
          'If enabled, every entry gets at most one lifeline for the competition.',
          'If disabled, no lifeline controls should be shown except informational text saying lifeline is disabled.',
        ],
      },
      {
        title: 'Player behavior',
        points: [
          'A player selects the lifeline checkbox for one unlocked gameweek before lock.',
          'Only one future gameweek can have the lifeline selected at a time for the same entry.',
          'Selecting a team should not accidentally clear the lifeline checkbox.',
          'If the player deselects the lifeline, it should become available again rather than auto-selecting another gameweek.',
        ],
      },
      {
        title: 'Outcome behavior',
        points: [
          'Win with lifeline selected: advance and the lifeline is consumed only according to the app rule currently implemented for selected lifeline usage.',
          'Draw with lifeline selected: advance and the lifeline is used.',
          'Loss with lifeline selected: eliminated. The lifeline does not save a losing pick.',
          'After the entry is eliminated, lifeline controls should be disabled in all gameweeks.',
        ],
      },
    ],
  },
  {
    id: 'participants',
    eyebrow: 'Participant management',
    title: 'Manage entries, users, and payments',
    summary: 'Participant actions should operate at entry level because one user can have more than one entry.',
    items: [
      {
        title: 'Participants panel',
        points: [
          'Use search and filters to find a participant or entry.',
          'If a user only has one entry, Entry #1 should be hidden to keep the UI clean.',
          'If a user has multiple entries, show entry numbers clearly so admins know which entry they are changing.',
          'CSV export should download or share the visible participant/payment data.',
        ],
      },
      {
        title: 'Manual payment actions',
        points: [
          'Mark as paid should update the selected participant entry only.',
          'Revert should undo payment status for the selected participant entry only.',
          'Show a loading or saving state so the admin knows the action is in progress.',
          'After the action, refresh participant and competition payment state so the UI reflects the change immediately.',
        ],
      },
      {
        title: 'Add or remove entries',
        points: [
          'Club admins can add entries for users when allowed by competition rules.',
          'Removing an entry should use a destructive confirmation modal.',
          'Deleting users is separate from removing entries and must protect audit history, club ownership, payments, picks, and competition integrity.',
        ],
      },
    ],
  },
  {
    id: 'results',
    eyebrow: 'Results and gameweeks',
    title: 'Process fixtures, results, and gameweek outcomes',
    summary: 'Results normally come from the fixture provider and are processed into player outcomes. Club admins should focus on reviewing the state and communicating clearly with players.',
    items: [
      {
        title: 'Fixture sync',
        points: [
          'When a competition is created, fixtures should sync for the selected provider and create gameweeks.',
          'Fixture grouping depends on the selected provider and should keep gameweeks sensible for players.',
          'As the season progresses, fixture sync should add future gameweeks when available and avoid unnecessary duplicate or redundant sync calls.',
          'For completed competitions, future unused gameweeks should be hidden or cleaned up because they no longer matter.',
        ],
      },
      {
        title: 'Live and final results',
        points: [
          'Live score polling should be conservative to control Render and Supabase usage.',
          'When a fixture is in progress, resolved picks may show advance or eliminated for that specific match, but pulse text should not imply the whole gameweek is complete until all relevant fixtures are resolved.',
          'When all relevant fixtures are complete, process the gameweek to update participant statuses.',
          'Odds and risk labels should not be shown for completed gameweeks because they no longer add value.',
        ],
      },
      {
        title: 'If a result looks wrong',
        points: [
          'Ask players to wait for the organiser to confirm the official result before making decisions based on a questionable score.',
          'Club admins should communicate the issue using an announcement so players know the result is being reviewed.',
          'If a correction is needed, the organiser should handle it through the private management process rather than asking players to take any action.',
          'After any correction, players should verify the survivor table, pick history, pulse, and gameweek results again.',
        ],
      },
    ],
  },
  {
    id: 'pause',
    eyebrow: 'Operational controls',
    title: 'Pause, resume, and void gameweeks',
    summary: 'Pause exists for exceptional situations where the competition should temporarily stop accepting picks or processing eliminations.',
    items: [
      {
        title: 'When to pause',
        points: [
          'Use pause when the organiser needs to temporarily stop the competition because of a provider issue, fixture problem, rule dispute, or admin decision.',
          'While paused, players should not be able to make picks for affected gameweeks.',
          'Paused competitions should clearly show a paused state on web and mobile.',
        ],
      },
      {
        title: 'Strict deadline behavior',
        points: [
          'Gameweek deadlines cannot be moved manually. The deadline is tied to fixture kickoff and remains strict.',
          'If the competition is paused and not resumed before a gameweek lock, that gameweek should be voided.',
          'A voided gameweek eliminates nobody. Active entries should remain active and move to the next valid gameweek.',
          'Voided gameweeks should not allow new picks after resume.',
        ],
      },
      {
        title: 'Resume behavior',
        points: [
          'If resumed before lock, players can continue making picks for the current gameweek until lock.',
          'If resumed after lock, picks should only be available in the next valid gameweek.',
          'If provider results arrive while paused, they should not eliminate players from a voided gameweek.',
        ],
      },
    ],
  },
  {
    id: 'announcements',
    eyebrow: 'Communication',
    title: 'Send announcements and reminders',
    summary: 'Announcements help admins communicate schedule changes, payment reminders, and competition updates.',
    items: [
      {
        title: 'Announcements',
        points: [
          'Create announcements from Club Admin for relevant competition or club updates.',
          'Players should see announcements in their competitions or activity/update area.',
          'Dismissed activity should stay dismissed for that user and should not reappear after logout/login unless it is a new event.',
        ],
      },
      {
        title: 'Email reminders',
        points: [
          'Pick reminders should use the deployed frontend URL, not localhost links.',
          'Result emails should be sent once per gameweek result cycle, not repeatedly spam users.',
          'Users can control email and notification preferences from Profile.',
        ],
      },
      {
        title: 'Push notifications',
        points: [
          'Production Android push requires Firebase configuration, google-services.json, FCM credentials, and a Play Store or development build.',
          'Expo Go does not support production remote notifications for current SDK behavior.',
          'If push registration fails, verify Firebase project, package name, google-services.json, server credentials, and app build type.',
        ],
      },
    ],
  },
];

const paymentOptions: OptionRow[] = [
  { option: 'Free', useWhen: 'No payment is collected through the app.', notes: 'Fastest setup. Players can join immediately. Payment state shows Not needed.' },
  { option: 'Manual', useWhen: 'The club collects cash, bank transfer, Revolut, or another offline payment.', notes: 'Admin marks each entry as paid. Best when the club already has an offline payment process.' },
];

const competitionOptions: OptionRow[] = [
  { option: 'Public visibility', useWhen: 'You want users to discover the competition without an invite code.', notes: 'Good for open club competitions or public test competitions.' },
  { option: 'Private visibility', useWhen: 'Only invited players should join.', notes: 'Share the labelled invite code or invite link from Club Admin.' },
  { option: 'Max entries per user', useWhen: 'You allow one or more entries per account.', notes: 'Every entry has independent picks, payment status, lifeline usage, and elimination state.' },
  { option: 'Lifeline enabled', useWhen: 'You want one draw-protection option per entry.', notes: 'Must be selected by the player before lock. It does not save a losing pick.' },
  { option: 'Missed pick mode', useWhen: 'You decide what happens if a player fails to pick.', notes: 'Strict competitions usually eliminate missed picks.' },
  { option: 'Fixture provider', useWhen: 'You choose the supported fixture source for this competition.', notes: 'Changing this after creation may require careful fixture resync.' },
];

const troubleshooting = [
  ['Fixtures are missing', 'Check fixture competition code, start date, provider availability, and whether fixture sync has run. For edited competitions, trigger or wait for a resync.'],
  ['New Competition is blocked', 'Your club has used its free competition and has no slot credits. Open the Competition Slots card on Club Admin and buy a competition slot, then try again.'],
  ['I paid for a slot but the balance did not change', 'Refresh Club Admin. Stripe confirms the payment to the app in the background, so the credit can take a few seconds to appear. If it still does not appear, contact support with the Stripe receipt.'],
  ['A player appears twice', 'This is expected only when they have multiple entries. The UI should show entry numbers only for users with multiple entries.'],
  ['Picks are stale', 'Use refresh. The app intentionally avoids aggressive polling to reduce Render and Supabase usage. Live information updates in a reasonable timeframe, not instantly.'],
  ['Email links point to localhost', 'Set the deployed frontend base URL in backend configuration so reminders use the production web URL.'],
];

export default function UserGuidePage() {
  return (
    <div className="min-h-screen bg-[linear-gradient(165deg,#070f22_0%,#0a1731_58%,#0a1730_100%)] px-4 py-10 text-white">
      <SeoMeta
        title="How to Use Last Man Standing | Detailed Player and Club Admin Guide"
        description="Detailed walkthrough for players and club admins covering competition setup, payment modes, lifelines, participants, results, pause rules, and troubleshooting."
        canonicalPath="/guide"
      />

      <div className="mx-auto max-w-6xl space-y-8">
        <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.22),transparent_28rem),rgba(15,23,42,0.72)] p-6 shadow-[0_24px_70px_rgba(2,6,23,0.45)] sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link to="/" className="text-xs font-semibold uppercase tracking-[0.16em] text-brand-300 hover:text-brand-200">Back to home</Link>
            <Link to="/faq" className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-white/[0.08]">FAQ</Link>
          </div>
          <div className="mt-6 max-w-4xl">
            <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-200">Detailed user guide</p>
            <h1 className="mt-3 text-4xl font-black tracking-tight sm:text-5xl">How to use Last Man Standing</h1>
            <p className="mt-4 text-base leading-7 text-slate-300">
              A complete walkthrough for players and club admins using the web portal or mobile app. It covers joining competitions,
              making picks, creating competitions, payment options, lifelines, participants, results, pause rules, announcements,
              and common issues.
            </p>
          </div>
          <div className="mt-6 grid gap-3 sm:grid-cols-4">
            <GuideMetric label="Player guide" value="Join, pick, track" />
            <GuideMetric label="Club admin guide" value="Create, invite, manage" />
            <GuideMetric label="Competition slots" value="1 free, then credits" />
            <GuideMetric label="Payments" value="Free, manual" />
          </div>
        </section>

        <nav className="rounded-[1.5rem] border border-white/10 bg-white/[0.035] p-4">
          <p className="text-xs font-black uppercase tracking-[0.14em] text-brand-200">Jump to</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {quickLinks.map(([label, href]) => (
              <a key={href} href={href} className="rounded-full border border-white/10 bg-surface-800 px-3 py-1.5 text-xs font-semibold text-gray-200 hover:border-brand-300/40 hover:text-brand-100">
                {label}
              </a>
            ))}
          </div>
        </nav>

        <ImageGrid />

        {playerSections.map((section) => <DetailedSection key={section.id} section={section} />)}

        <OptionTable id="create-competition-options" title="Competition creation option reference" rows={competitionOptions} />

        {adminSections.map((section) => <DetailedSection key={section.id} section={section} />)}

        <OptionTable id="payment-options" title="Payment mode reference" rows={paymentOptions} />

        <section id="troubleshooting" className="rounded-[1.8rem] border border-white/10 bg-white/[0.035] p-6">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-amber-200">Troubleshooting</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight">Common issues and what to check</h2>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {troubleshooting.map(([problem, fix]) => (
              <article key={problem} className="rounded-2xl border border-white/10 bg-surface-900/60 p-4">
                <h3 className="font-black text-white">{problem}</h3>
                <p className="mt-2 text-sm leading-6 text-gray-300">{fix}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="rounded-[1.8rem] border border-brand-300/20 bg-brand-500/10 p-6">
          <h2 className="text-2xl font-black">Need a shorter rules explanation?</h2>
          <p className="mt-2 text-sm leading-6 text-brand-50/85">
            The FAQ contains concise answers for common player questions, lifeline rules, payment rules, postponed fixtures, and entry states.
          </p>
          <Link to="/faq" className="mt-4 inline-flex rounded-xl border border-brand-300/30 bg-brand-500/20 px-4 py-2 text-sm font-bold text-brand-100 hover:bg-brand-500/30">
            Open FAQ
          </Link>
        </section>
      </div>
    </div>
  );
}

function ImageGrid() {
  const images = [
    ['Competitions landing', '/guide/screenshots/guide-player-competitions.svg'],
    ['Competition detail', '/guide/screenshots/guide-player-competition-detail.svg'],
    ['My Route', '/guide/screenshots/guide-player-my-route.svg'],
    ['Club Admin', '/guide/screenshots/guide-admin-dashboard.svg'],
    ['Competition slots', '/guide/screenshots/guide-admin-billing-slots.svg'],
  ];
  return (
    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      {images.map(([label, src]) => (
        <article key={src} className="flex flex-col overflow-hidden rounded-2xl border border-white/10 bg-white/[0.035]">
          <div className="border-b border-white/10 px-4 py-3 text-sm font-bold text-gray-100">{label}</div>
          <img src={src} alt={label} loading="lazy" className="block h-auto w-full bg-slate-950/70" />
        </article>
      ))}
    </section>
  );
}

function DetailedSection({ section }: { section: GuideSection }) {
  return (
    <section id={section.id} className="scroll-mt-8 rounded-[1.8rem] border border-white/10 bg-white/[0.035] p-6 shadow-[0_18px_45px_rgba(2,6,23,0.28)]">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-brand-200">{section.eyebrow}</p>
      <h2 className="mt-2 text-3xl font-black tracking-tight text-white">{section.title}</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-gray-300">{section.summary}</p>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {section.items.map((item) => (
          <article key={item.title} className="rounded-2xl border border-white/10 bg-surface-900/60 p-5">
            <h3 className="text-lg font-black text-white">{item.title}</h3>
            <ul className="mt-3 space-y-2 text-sm leading-6 text-gray-300">
              {item.points.map((point) => <li key={point}>- {point}</li>)}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

function OptionTable({ id, title, rows }: { id: string; title: string; rows: OptionRow[] }) {
  return (
    <section id={id} className="scroll-mt-8 rounded-[1.8rem] border border-white/10 bg-surface-900/55 p-6">
      <h2 className="text-2xl font-black text-white">{title}</h2>
      <div className="mt-4 overflow-hidden rounded-2xl border border-white/10">
        <div className="grid grid-cols-3 bg-white/[0.04] text-xs font-black uppercase tracking-[0.16em] text-gray-400">
          <div className="px-4 py-3">Option</div>
          <div className="px-4 py-3">Use when</div>
          <div className="px-4 py-3">Notes</div>
        </div>
        {rows.map((row) => (
          <div key={row.option} className="grid grid-cols-1 border-t border-white/10 text-sm text-gray-300 md:grid-cols-3">
            <div className="px-4 py-3 font-bold text-white">{row.option}</div>
            <div className="px-4 py-3">{row.useWhen}</div>
            <div className="px-4 py-3">{row.notes}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function GuideMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="text-lg font-black text-white">{value}</div>
      <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
    </div>
  );
}
