import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

/**
 * Landing page after OAuth2 redirect from backend.
 * URL: /oauth2/callback?token=<jwt>&provider=<name>
 * Stores the JWT and navigates to competitions.
 */
export default function OAuth2CallbackPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { loginWithToken } = useAuth();

  useEffect(() => {
    const token = params.get('token');
    const error = params.get('error');
    const provider = params.get('provider') ?? 'provider';

    if (error) {
      toast.error(`Sign in failed: ${error}`);
      navigate('/login', { replace: true });
      return;
    }

    if (!token) {
      toast.error('No token received. Please try again.');
      navigate('/login', { replace: true });
      return;
    }

    // Store token and fetch user profile
    loginWithToken(token)
      .then(() => {
        toast.success(`Signed in with ${provider}!`);
        // Use hard navigation so AuthProvider re-reads localStorage on mount
        // This avoids the race condition where ProtectedRoute sees user=null
        // before React state has updated from loginWithToken
        window.location.href = '/competitions';
      })
      .catch((err: unknown) => {
        console.error('OAuth2 callback error:', err);
        toast.error('Failed to complete sign in. Please try again.');
        navigate('/login', { replace: true });
      });
  }, [params, navigate, loginWithToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-900">
      <div className="text-center space-y-4">
        <div className="h-10 w-10 mx-auto animate-spin rounded-full border-2 border-brand-500 border-t-transparent" />
        <p className="text-gray-400">Completing sign in…</p>
      </div>
    </div>
  );
}
