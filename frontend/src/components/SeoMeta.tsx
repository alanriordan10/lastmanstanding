import { useEffect } from 'react';

type SeoMetaProps = {
  title: string;
  description: string;
  canonicalPath?: string;
  jsonLd?: object[];
};

function upsertMeta(name: string, content: string) {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute('name', name);
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

export default function SeoMeta({ title, description, canonicalPath, jsonLd = [] }: SeoMetaProps) {
  useEffect(() => {
    document.title = title;
    upsertMeta('description', description);

    if (canonicalPath) {
      const origin = window.location.origin;
      upsertCanonical(`${origin}${canonicalPath}`);
    }

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
  }, [title, description, canonicalPath, jsonLd]);

  return null;
}

