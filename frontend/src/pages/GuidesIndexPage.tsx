import SeoMeta from '../components/SeoMeta';
import ArticleIndex from '../components/ArticleIndex';
import { guides } from '../content/articles';
import { SITE_ORIGIN } from '../config/site';

export default function GuidesIndexPage() {
  const guidesCollectionSchema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: 'Last Man Standing Guides',
    url: `${SITE_ORIGIN}/guides`,
    description: 'Step-by-step Last Man Standing setup and club admin guides.',
    isPartOf: {
      '@type': 'WebSite',
      name: 'Last Man Standing',
      url: SITE_ORIGIN,
    },
  };

  const guidesListSchema = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Last Man Standing Guides',
    itemListOrder: 'https://schema.org/ItemListOrderAscending',
    numberOfItems: guides.length,
    itemListElement: guides.map((guide, idx) => ({
      '@type': 'ListItem',
      position: idx + 1,
      url: `${SITE_ORIGIN}/guides/${guide.slug}`,
      name: guide.title,
    })),
  };

  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: SITE_ORIGIN,
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Guides',
        item: `${SITE_ORIGIN}/guides`,
      },
    ],
  };

  return (
    <>
      <SeoMeta
        title="Last Man Standing Guides | Setup, Rules & Club Admin Tutorials"
        description="Browse Last Man Standing guides for club setup, competition creation, picks, lifelines, payment modes, and results management."
        canonicalPath="/guides"
        jsonLd={[guidesCollectionSchema, guidesListSchema, breadcrumbSchema]}
      />
      <ArticleIndex variant="guides" articles={guides} />
    </>
  );
}
