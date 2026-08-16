import { useParams } from 'react-router-dom';
import ArticleDetail from '../components/ArticleDetail';
import { blogPosts } from '../content/articles';

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  // Touch slug so React renders fresh content on slug change without
  // the URL being the only signal.
  void slug;
  return <ArticleDetail variant="blog" articles={blogPosts} />;
}
