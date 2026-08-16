import SeoMeta from '../components/SeoMeta';
import ArticleIndex from '../components/ArticleIndex';
import { blogPosts } from '../content/articles';

export default function BlogIndexPage() {
  return (
    <>
      <SeoMeta
        title="Blog | Last Man Standing"
        description="Strategy, rules and how-tos for running a last man standing football competition. Practical guides from the Last Man Standing team."
        canonicalPath="/blog"
      />
      <ArticleIndex variant="blog" articles={blogPosts} />
    </>
  );
}
