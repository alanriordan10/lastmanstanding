import SeoMeta from '../components/SeoMeta';
import ArticleIndex from '../components/ArticleIndex';
import { guides } from '../content/articles';

export default function GuidesIndexPage() {
  return (
    <>
      <SeoMeta
        title="Last Man Standing Guides | Setup, Rules & Club Admin Tutorials"
        description="Browse Last Man Standing guides for club setup, competition creation, picks, lifelines, payment modes, and results management."
        canonicalPath="/guides"
      />
      <ArticleIndex variant="guides" articles={guides} />
    </>
  );
}
