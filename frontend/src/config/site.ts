const DEFAULT_SITE_ORIGIN = 'https://runlastmanstanding.com';

function normalizeOrigin(origin: string): string {
  const trimmed = origin.trim().replace(/\/$/, '');
  try {
	return new URL(trimmed).origin;
  } catch {
	return DEFAULT_SITE_ORIGIN;
  }
}

export const SITE_ORIGIN = normalizeOrigin(
  import.meta.env.VITE_SITE_ORIGIN || DEFAULT_SITE_ORIGIN
);

export {};



