import { useEffect } from 'react';

type SeoMetaProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  jsonLd?: object[];
  imagePath?: string;
  type?: 'website' | 'article';
  noindex?: boolean;
};

function upsertMeta(attribute: 'name' | 'property', key: string, content: string) {
  let el = document.querySelector(`meta[${attribute}="${key}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attribute, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function upsertCanonical(href: string) {
  let el = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', 'canonical');
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

export default function SeoMeta({
  title,
  description,
  canonicalPath,
  jsonLd = [],
  imagePath = '/app-logo.png',
  type = 'website',
  noindex = false,
}: SeoMetaProps) {
  useEffect(() => {
    const origin = window.location.origin;
    const canonicalUrl = `${origin}${canonicalPath ?? window.location.pathname}`;
    const imageUrl = imagePath.startsWith('http') ? imagePath : `${origin}${imagePath}`;

    document.title = title;
    upsertMeta('name', 'description', description);
    upsertMeta('name', 'robots', noindex ? 'noindex,nofollow' : 'index,follow');
    upsertMeta('property', 'og:title', title);
    upsertMeta('property', 'og:description', description);
    upsertMeta('property', 'og:type', type);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', imageUrl);
    upsertMeta('property', 'og:site_name', 'Last Man Standing');
    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', title);
    upsertMeta('name', 'twitter:description', description);
    upsertMeta('name', 'twitter:image', imageUrl);
    upsertCanonical(canonicalUrl);

    const injected: HTMLScriptElement[] = [];
    jsonLd.forEach((schema, index) => {
      const script = document.createElement('script');
      script.type = 'application/ld+json';
      script.dataset.seo = 'jsonld';
      script.dataset.seoIndex = String(index);
      script.text = JSON.stringify(schema);
      document.head.appendChild(script);
      injected.push(script);
    });

    return () => {
      injected.forEach((s) => s.remove());
    };
  }, [title, description, canonicalPath, jsonLd, imagePath, type, noindex]);

  return null;
}

