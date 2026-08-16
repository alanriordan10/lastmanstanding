import { useParams } from 'react-router-dom';
import ArticleDetail from '../components/ArticleDetail';
import { guides } from '../content/articles';

export default function GuidePage() {
  const { slug } = useParams<{ slug: string }>();
  void slug;
  return <ArticleDetail variant="guides" articles={guides} />;
}
