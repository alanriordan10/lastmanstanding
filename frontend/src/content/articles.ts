export type ArticleSection = {
  heading: string;
  paragraphs: string[];
};

export type Article = {
  slug: string;
  title: string;
  description: string;
  date: string;
  readingTimeMinutes: number;
  category: string;
  relatedSlugs?: string[];
  body: ArticleSection[];
};

export const blogPosts: Article[] = [
  {
    slug: 'how-to-run-a-last-man-standing-competition',
    title: 'How to Run a Last Man Standing Competition: Complete Guide',
    description:
      'Everything you need to know to run a last man standing competition online, from the basic rules through to picking a platform that does the scoring for you.',
    date: '2026-08-01',
    readingTimeMinutes: 8,
    category: 'Getting Started',
    relatedSlugs: ['last-man-standing-rules', 'survivor-pool-strategy'],
    body: [
      {
        heading: 'What is a last man standing competition?',
        paragraphs: [
          'A last man standing competition (also called a survivor pool or knockout pool) is a football prediction game where each player picks one team per gameweek. If your team wins or draws, you survive to the next round. Lose and you are out. The last player still standing wins the pot.',
          'It is popular with clubs, GAA groups, workplaces, pubs and friend groups because the rules are simple, the season provides natural drama, and the elimination mechanic keeps everyone engaged from week one.',
        ],
      },
      {
        heading: 'The basic rules',
        paragraphs: [
          'Every player picks exactly one team per gameweek before the deadline. That team must win or draw for the player to advance. A loss eliminates the player immediately. The most important rule: once you have used a team, you cannot pick them again — even if they win every remaining game.',
          'Gameweeks usually lock at the kick-off of the first match in that round. Most competitions run from gameweek 1 through the final round of the Premier League season, but shorter formats (post-Christmas, World Cup only) work just as well.',
        ],
      },
      {
        heading: 'Lifelines and other twists',
        paragraphs: [
          'Many competitions add a lifeline — usually one per entry — which lets a player survive an incorrect pick. Some competitions allow auto-assign, where the system picks a team for a player who forgot to submit. Others offer multi-entry, so one person can buy two or three lives for a fee.',
          'These options make the game friendlier for casual groups and harder for serious strategists. Choose what fits your crowd.',
        ],
      },
      {
        heading: 'How to run one for your club or group',
        paragraphs: [
          'You can run a last man standing competition on paper with a WhatsApp group, but you will spend hours every weekend chasing picks, manually checking results and updating a spreadsheet. The bigger your group gets, the more painful this becomes.',
          'Software like Last Man Standing automates the whole thing: players submit picks via app or web, results are pulled in automatically from the Premier League feed, and the standings update in real time. You set the rules, share an invite code, and run the competition.',
        ],
      },
      {
        heading: 'What to look for in software',
        paragraphs: [
          'When choosing last man standing software, look for: automatic result updates, mobile and web access, payment tracking if your pool charges entry, lifeline support, and clear rules for postponed fixtures and missed picks. A free trial or first-competition-free tier lets you test before committing.',
        ],
      },
    ],
  },
  {
    slug: 'last-man-standing-rules',
    title: 'Last Man Standing Rules: How Knockout Survivor Pools Work',
    description:
      'A clear breakdown of the rules that govern last man standing competitions — wins, draws, postponements, missed picks and lifelines explained.',
    date: '2026-08-04',
    readingTimeMinutes: 6,
    category: 'Rules',
    relatedSlugs: ['how-to-run-a-last-man-standing-competition'],
    body: [
      {
        heading: 'The core rule',
        paragraphs: [
          'Pick one team per gameweek. If that team wins or draws, you survive. If they lose, you are eliminated. Each team can only be used once per entry across the whole competition.',
          'That single rule is the engine. Everything else — lifelines, postponed fixtures, multi-entries — exists to handle the edge cases.',
        ],
      },
      {
        heading: 'Wins, draws and postponements',
        paragraphs: [
          'A draw counts as a survival because the team did not lose. The most common edge case is the postponed fixture: if the team you picked has its match moved to a later date, most competitions either (a) let the pick stand and resolve when the match is replayed, or (b) allow the player to swap to a different unplayed team. Decide and document this before the season starts.',
        ],
      },
      {
        heading: 'Missed picks',
        paragraphs: [
          'If a player forgets to submit before the deadline, the competition has to decide what happens. The two common approaches are elimination (you forgot, you are out) or auto-assign (the system picks the lowest-ranked available team). Auto-assign is friendlier to casual groups but punishes serious players.',
        ],
      },
      {
        heading: 'Lifelines',
        paragraphs: [
          'A lifeline lets a player survive one incorrect pick during the season. The most common rule: one lifeline per entry, used automatically the first time a pick loses. Some competitions let players choose when to use it; others trigger it silently. Decide before gameweek 1 and tell everyone.',
        ],
      },
      {
        heading: 'Multi-entries',
        paragraphs: [
          'Multi-entry means one person can buy two or three lives. Useful for friend groups where some people want to take bigger risks. Each entry is independent — a player cannot use the same team across two entries, and lifelines do not transfer.',
        ],
      },
    ],
  },
  {
    slug: 'survivor-pool-strategy',
    title: 'Survivor Pool Strategy: How to Pick Winning Teams',
    description:
      'A practical guide to picking teams in a last man standing competition — when to use your big-name team, how to spot upsets, and common mistakes.',
    date: '2026-08-08',
    readingTimeMinutes: 7,
    category: 'Strategy',
    relatedSlugs: ['how-to-run-a-last-man-standing-competition', 'last-man-standing-rules'],
    body: [
      {
        heading: 'Don’t burn your best team in week 1',
        paragraphs: [
          'The single biggest mistake new players make is picking Manchester City or Arsenal in gameweek 1. They almost always win — but you have used your best team and cannot pick them again. By Christmas you are scrambling for mid-table sides with no margin for error.',
          'Save the obvious favourites for late-season rounds when the competition is thin and one good pick can carry you to the final.',
        ],
      },
      {
        heading: 'Read the fixture list',
        paragraphs: [
          'Every Tuesday the Premier League fixture list for the next gameweek is published. Look for matches between two evenly matched teams (50/50), matches where the favourite has European commitments midweek, and matches where a big team is playing away from home. The best picks are not always the favourites.',
        ],
      },
      {
        heading: 'Diversify across the league',
        paragraphs: [
          'By the time you reach the final gameweek, you need a team that has not played yet. Most competitions that go the distance need you to have spread your picks across the league rather than concentrating on a handful of clubs.',
        ],
      },
      {
        heading: 'When to trust an upset',
        paragraphs: [
          'Lower-table sides win games — it happens every week. If a promoted side is playing a tired Champions League team at home, the upset is plausible. Trust the data: every season, every team in the division wins at least three games.',
        ],
      },
    ],
  },
];

export const guides: Article[] = [
  {
    slug: 'setting-up-your-club',
    title: 'Setting Up Your Club on Last Man Standing',
    description:
      'Step-by-step: create a club, configure payment and rules, share an invite code with your members.',
    date: '2026-08-02',
    readingTimeMinutes: 5,
    category: 'Setup',
    relatedSlugs: ['running-your-first-competition', 'configuring-lifelines'],
    body: [
      {
        heading: 'Create your club',
        paragraphs: [
          'Sign up at runlastmanstanding.com and choose "Create your club" from the dashboard. Pick a unique name, add a one-line description and confirm your email. The first competition for every new club is free.',
        ],
      },
      {
        heading: 'Configure your rules',
        paragraphs: [
          'Open Club Admin → Settings. Decide: free or paid entry, lifeline allowed (recommended for casual groups), missed pick behaviour (eliminate or auto-assign), and multi-entry allowance. Document the rules in your welcome message so nobody is surprised later.',
        ],
      },
      {
        heading: 'Share your invite code',
        paragraphs: [
          'Each competition has a unique code. Share it on your WhatsApp / Teams / Discord and members join with one tap. The standings update live once gameweek 1 starts.',
        ],
      },
    ],
  },
  {
    slug: 'running-your-first-competition',
    title: 'Running Your First Survivor Pool Competition',
    description:
      'From competition creation through to declaring a winner — the full lifecycle of running a competition.',
    date: '2026-08-06',
    readingTimeMinutes: 6,
    category: 'Run a competition',
    relatedSlugs: ['setting-up-your-club', 'configuring-lifelines'],
    body: [
      {
        heading: 'Create the competition',
        paragraphs: [
          'Club Admin → Competitions → New. Name it (e.g. "LMS 2026/27"), pick the fixture window (full Premier League season or a custom range), and decide if entry is free or paid.',
        ],
      },
      {
        heading: 'Invite members',
        paragraphs: [
          'Share the invite code. Players join via the app or web. You can see who has joined in the participants tab and nudge anyone who has not yet submitted picks.',
        ],
      },
      {
        heading: 'During the season',
        paragraphs: [
          'Results are pulled in automatically from the Premier League feed. Standings update in real time. If a fixture is postponed, you can choose how to handle it from the admin tools. Lifelines, if enabled, are applied automatically.',
        ],
      },
      {
        heading: 'Declaring the winner',
        paragraphs: [
          'When only one entry is left standing, the competition auto-completes and the winner is shown on the standings page. You can also manually declare a winner earlier if your group agrees (e.g. after the final gameweek if one entry has clearly won).',
        ],
      },
    ],
  },
  {
    slug: 'configuring-lifelines',
    title: 'Configuring Lifelines for Your Competition',
    description:
      'How lifelines work, when to enable them, and how to configure them per competition.',
    date: '2026-08-10',
    readingTimeMinutes: 4,
    category: 'Rules',
    relatedSlugs: ['running-your-first-competition'],
    body: [
      {
        heading: 'What is a lifeline?',
        paragraphs: [
          'A lifeline lets an entry survive one incorrect pick during the season. Without a lifeline, one bad pick and you are out — which is great for hardcore groups but harsh for casual ones.',
        ],
      },
      {
        heading: 'When to enable lifelines',
        paragraphs: [
          'Enable for casual groups, friend leagues, or any competition where the entry fee is low. Disable for serious contests with a meaningful prize pool.',
        ],
      },
      {
        heading: 'How to configure',
        paragraphs: [
          'Competition Settings → Rules → Lifeline. One lifeline per entry is the default. Advanced mode lets you choose auto-trigger (silent) vs manual (player decides when to use it).',
        ],
      },
    ],
  },
];
