import { Link } from 'react-router-dom';
import { format } from 'date-fns';
import type { Article } from '../content/articles';

type Variant = 'blog' | 'guides';

const titles: Record<Variant, { hero: string; subtitle: string; cta: string }> = {
  blog: {
    hero: 'Field notes from the survivor pool',
    subtitle: 'Strategy, rules, and how-tos for running a last man standing competition.',
    cta: 'Read on',
  },
  guides: {
    hero: 'Step-by-step guides',
    subtitle: 'Practical walkthroughs for setting up your club and running competitions on Last Man Standing.',
    cta: 'Open guide',
  },
};

const indexSchemas: Record<Variant, string> = {
  blog: 'Blog',
  guides: 'Guides',
};

export default function ArticleIndex({ variant, articles }: { variant: Variant; articles: Article[] }) {
  const meta = titles[variant];
  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:py-16">
      <header className="mb-10 text-center">
        <p className="text-xs font-medium uppercase tracking-wider text-brand-300">{indexSchemas[variant]}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{meta.hero}</h1>
        <p className="mt-3 text-sm text-slate-400 sm:text-base">{meta.subtitle}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        {articles.map((article) => (
          <Link
            key={article.slug}
            to={`/${variant}/${article.slug}`}
            className="group flex flex-col rounded-lg border border-slate-800 bg-slate-900 p-5 transition-colors hover:border-brand-500/40 hover:bg-slate-800"
          >
            <div className="flex items-center gap-2 text-xs">
              <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 font-medium uppercase tracking-wider text-slate-400">
                {article.category}
              </span>
              <time
                dateTime={article.date}
                className="text-slate-500"
              >
                {format(new Date(article.date), 'd MMM yyyy')}
              </time>
            </div>
            <h2 className="mt-3 text-lg font-semibold leading-snug text-white group-hover:text-brand-300">
              {article.title}
            </h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{article.description}</p>
            <p className="mt-4 text-xs font-medium text-brand-300">
              {meta.cta} · {article.readingTimeMinutes} min read
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
