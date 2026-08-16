import SeoMeta from '../components/SeoMeta';
import ArticleIndex from '../components/ArticleIndex';
import { guides } from '../content/articles';

export default function GuidesIndexPage() {
  return (
    <>
      <SeoMeta
        title="Guides | Last Man Standing"
        description="Step-by-step guides for setting up your club, running your first competition, and configuring rules on Last Man Standing."
        canonicalPath="/guides"
      />
      <ArticleIndex variant="guides" articles={guides} />
    </>
  );
}
