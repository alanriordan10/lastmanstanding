import { Link, useParams } from 'react-router-dom';
import { format } from 'date-fns';
import SeoMeta from '../components/SeoMeta';
import type { Article } from '../content/articles';

type Variant = 'blog' | 'guides';

const basePaths: Record<Variant, string> = { blog: '/blog', guides: '/guides' };
const indexLabels: Record<Variant, string> = { blog: 'Blog', guides: 'Guides' };

export default function ArticleDetail({ variant, articles }: { variant: Variant; articles: Article[] }) {
  const { slug } = useParams<{ slug: string }>();
  const article = articles.find((a) => a.slug === slug);

  if (!article) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <h1 className="text-2xl font-semibold text-white">Not found</h1>
        <p className="mt-3 text-sm text-slate-400">We couldn't find that {variant === 'blog' ? 'post' : 'guide'}.</p>
        <Link to={basePaths[variant]} className="mt-6 inline-block text-sm font-medium text-brand-300 hover:text-brand-200">
          ← Back to {indexLabels[variant]}
        </Link>
      </div>
    );
  }

  const canonicalPath = `${basePaths[variant]}/${article.slug}`;
  const origin = typeof window !== 'undefined' ? window.location.origin : 'https://www.runlastmanstanding.com';
  const canonicalUrl = `${origin}${canonicalPath}`;

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: article.description,
    datePublished: article.date,
    author: { '@type': 'Organization', name: 'Last Man Standing' },
    publisher: {
      '@type': 'Organization',
      name: 'Last Man Standing',
      logo: { '@type': 'ImageObject', url: `${origin}/app-logo.png` },
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': canonicalUrl },
  };

  const related = (article.relatedSlugs ?? [])
    .map((slug) => articles.find((a) => a.slug === slug))
    .filter((a): a is Article => Boolean(a));

  return (
    <>
      <SeoMeta
        title={`${article.title} | Last Man Standing`}
        description={article.description}
        canonicalPath={canonicalPath}
        type="article"
        jsonLd={[articleSchema]}
      />

      <article className="mx-auto max-w-3xl px-4 py-12 sm:py-16">
        <header className="mb-8">
          <Link to={basePaths[variant]} className="text-xs font-medium text-brand-300 hover:text-brand-200">
            ← {indexLabels[variant]}
          </Link>
          <div className="mt-3 flex items-center gap-2 text-xs">
            <span className="rounded-md border border-slate-800 bg-slate-950 px-2 py-0.5 font-medium uppercase tracking-wider text-slate-400">
              {article.category}
            </span>
            <time dateTime={article.date} className="text-slate-500">
              {format(new Date(article.date), 'd MMMM yyyy')}
            </time>
            <span className="text-slate-600">·</span>
            <span className="text-slate-500">{article.readingTimeMinutes} min read</span>
          </div>
          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
            {article.title}
          </h1>
          <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{article.description}</p>
        </header>

        <div className="space-y-8">
          {article.body.map((section, i) => (
            <section key={i}>
              <h2 className="text-xl font-semibold text-white sm:text-2xl">{section.heading}</h2>
              <div className="mt-3 space-y-3">
                {section.paragraphs.map((p, j) => (
                  <p key={j} className="text-base leading-relaxed text-slate-300">{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>

        {related.length > 0 ? (
          <aside className="mt-12 border-t border-slate-800 pt-8">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400">Keep reading</h3>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {related.map((r) => (
                <Link
                  key={r.slug}
                  to={`/${variant}/${r.slug}`}
                  className="group rounded-md border border-slate-800 bg-slate-900 p-4 transition-colors hover:border-brand-500/40"
                >
                  <p className="text-sm font-semibold text-white group-hover:text-brand-300">{r.title}</p>
                  <p className="mt-1 text-xs text-slate-500">{r.readingTimeMinutes} min read</p>
                </Link>
              ))}
            </div>
          </aside>
        ) : null}
      </article>
    </>
  );
}
