import { useState } from 'react';

interface SocialAuthButtonsProps {
  mode: 'signup' | 'login';
  continuationHint?: string;
}

const apiBaseUrl = import.meta.env.VITE_API_URL ?? 'http://localhost:8080';
const GOOGLE_OAUTH_PATH = '/oauth2/google';

const providers = [
  {
    id: 'google',
    name: 'Google',
    textColor: 'text-gray-100',
    bg: 'bg-[linear-gradient(135deg,rgba(30,41,59,0.88),rgba(15,23,42,0.92))] hover:bg-[linear-gradient(135deg,rgba(51,65,85,0.92),rgba(30,41,59,0.92))]',
    border: 'border border-white/12 hover:border-brand-400/45',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
];

export default function SocialAuthButtons({ mode, continuationHint }: SocialAuthButtonsProps) {
  const verb = mode === 'signup' ? 'Sign up' : 'Sign in';
  const [oauthBusyProvider, setOauthBusyProvider] = useState<string | null>(null);

  const handleClick = (providerName: string) => {
    if (oauthBusyProvider) return;
    setOauthBusyProvider(providerName);
    const base = apiBaseUrl.replace(/\/+$/, '');
    const returnTo = new URLSearchParams(window.location.search).get('returnTo');
    const query = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : '';
    window.location.href = `${base}${GOOGLE_OAUTH_PATH}${query}`;
  };

  return (
    <div className="space-y-3">
      {/* Divider */}
      <div className="relative flex items-center">
        <div className="flex-grow border-t border-gray-700" />
        <span className="mx-3 shrink-0 text-xs text-gray-500">or {verb} with</span>
        <div className="flex-grow border-t border-gray-700" />
      </div>

      {/* Provider buttons */}
      <div className="grid grid-cols-1 gap-3">
        {providers.map((provider) => {
          const isBusy = oauthBusyProvider === provider.name;
          return (
          <button
            key={provider.id}
            type="button"
            onClick={() => handleClick(provider.name)}
            disabled={Boolean(oauthBusyProvider)}
            className={`group flex items-center justify-center gap-2.5 rounded-xl px-4 py-3 text-sm font-semibold tracking-tight transition-all shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] ${provider.bg} ${provider.border} ${provider.textColor} ${oauthBusyProvider ? 'cursor-not-allowed opacity-80' : ''}`}
            aria-label={`${verb} with ${provider.name}`}
            aria-busy={isBusy}
          >
            {isBusy ? (
              <svg className="h-5 w-5 animate-spin text-brand-300" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
                <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
              </svg>
            ) : (
              provider.icon
            )}
            <span>{isBusy ? `Opening ${provider.name}...` : `${verb} with ${provider.name}${continuationHint ? ` ${continuationHint}` : ''}`}</span>
            {isBusy ? null : (
              <svg
                className="h-4 w-4 text-brand-300/80 transition-transform group-hover:translate-x-0.5"
                viewBox="0 0 20 20"
                fill="currentColor"
                aria-hidden="true"
              >
                <path fillRule="evenodd" d="M3 10a1 1 0 011-1h9.586l-2.293-2.293a1 1 0 111.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414-1.414L13.586 11H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          );
        })}
      </div>
    </div>
  );
}
