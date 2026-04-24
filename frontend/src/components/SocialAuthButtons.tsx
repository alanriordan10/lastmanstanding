import toast from 'react-hot-toast';

interface SocialAuthButtonsProps {
  mode: 'signup' | 'login';
}

// Providers with real OAuth2 backend support
const OAUTH2_PROVIDERS: Record<string, string> = {
  google:   '/oauth2/authorization/google',
  facebook: '/oauth2/authorization/facebook',
};

const providers = [
  {
    id: 'google',
    name: 'Google',
    textColor: 'text-gray-900',
    bg: 'bg-white hover:bg-gray-50',
    border: 'border border-gray-300',
    icon: (
      <svg className="h-5 w-5" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
    ),
  },
  {
    id: 'facebook',
    name: 'Facebook',
    textColor: 'text-white',
    bg: 'bg-[#1877F2] hover:bg-[#166FE5]',
    border: '',
    icon: (
      <svg className="h-5 w-5" fill="white" viewBox="0 0 24 24">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    id: 'instagram',
    name: 'Instagram',
    textColor: 'text-white',
    bg: 'bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#FCAF45] hover:opacity-90',
    border: '',
    icon: (
      <svg className="h-5 w-5" fill="white" viewBox="0 0 24 24">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
      </svg>
    ),
  },
  {
    id: 'apple',
    name: 'Apple',
    textColor: 'text-white',
    bg: 'bg-black hover:bg-gray-900',
    border: 'border border-gray-700',
    icon: (
      <svg className="h-5 w-5" fill="white" viewBox="0 0 24 24">
        <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
      </svg>
    ),
  },
];

export default function SocialAuthButtons({ mode }: SocialAuthButtonsProps) {
  const verb = mode === 'signup' ? 'Sign up' : 'Sign in';

  const handleClick = (providerId: string, providerName: string) => {
    const oauthUrl = OAUTH2_PROVIDERS[providerId];
    if (oauthUrl) {
      // Redirect to Spring Security OAuth2 authorization endpoint
      window.location.href = `http://localhost:8080${oauthUrl}`;
    } else {
      toast(`${providerName} sign in coming soon!`, { icon: '🚧', duration: 3000 });
    }
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
      <div className="grid grid-cols-2 gap-3">
        {providers.map((provider) => (
          <button
            key={provider.id}
            type="button"
            onClick={() => handleClick(provider.id, provider.name)}
            className={`flex items-center justify-center gap-2.5 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${provider.bg} ${provider.border} ${provider.textColor}`}
            aria-label={`${verb} with ${provider.name}`}
          >
            {provider.icon}
            <span>{provider.name}</span>
            {!OAUTH2_PROVIDERS[provider.id] && (
              <span className="text-[10px] opacity-60 ml-0.5">soon</span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
