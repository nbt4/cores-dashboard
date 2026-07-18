import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useBranding } from '../hooks/useBranding';
import { api } from '../lib/api';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const branding = useBranding();
  const [searchParams] = useSearchParams();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [methods, setMethods] = useState({ localEnabled: true, microsoftEnabled: false });

  useEffect(() => {
    const callbackError = searchParams.get('error');
    if (callbackError) setError(callbackError);
    api.get('/auth/methods').then(response => setMethods(response.data)).catch(() => undefined);
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      navigate('/');
    } catch {
      setError('Ungültige Anmeldedaten');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-dark flex items-center justify-center relative overflow-hidden">
      {/* Red glow behind card */}
      <div className="absolute w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'rgba(var(--accent-red-rgb), 0.12)', filter: 'blur(80px)', top: '50%', left: '50%', transform: 'translate(-50%, -60%)' }} />

      <div className="relative z-10 w-full max-w-sm mx-4">
        <div className="rounded-2xl p-8 flex flex-col items-center gap-6"
          style={{ background: 'rgba(var(--color-dark-100-rgb), 0.92)', backdropFilter: 'blur(12px)', border: '1px solid var(--border-subtle)' }}>

          <div className="flex flex-col items-center gap-3">
            <img
              src={branding.loginLogo}
              alt={branding.companyName}
              className="h-20"
              style={{ filter: 'drop-shadow(0 0 18px rgba(var(--accent-red-rgb), 0.3))', height: `${80 * branding.logoSizeLogin / 100}px` }}
            />
            <p className="text-gray-500 text-xs">{branding.companyName}</p>
          </div>

          {methods.microsoftEnabled && <button type="button" onClick={() => { window.location.href = '/api/v1/auth/microsoft/start'; }}
            className="w-full py-3 px-4 rounded-lg font-semibold text-white transition-all flex items-center justify-center gap-3 border border-white/15 hover:bg-white/5">
            <span className="grid grid-cols-2 gap-[2px] w-4 h-4" aria-hidden="true">
              <span className="bg-[#f25022]" /><span className="bg-[#7fba00]" /><span className="bg-[#00a4ef]" /><span className="bg-[#ffb900]" />
            </span>
            Mit Microsoft anmelden
          </button>}

          {methods.microsoftEnabled && methods.localEnabled && <div className="w-full flex items-center gap-3 text-gray-600 text-xs"><span className="h-px bg-white/10 flex-1" />oder lokal<span className="h-px bg-white/10 flex-1" /></div>}

          {methods.localEnabled && <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
            <input
              type="text"
              placeholder="Benutzername"
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full px-4 py-3 rounded-lg"
              required
              autoFocus
            />
            <input
              type="password"
              placeholder="Passwort"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'var(--accent-red)', boxShadow: '0 0 16px rgba(var(--accent-red-rgb), 0.25)' }}
            >
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>}
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}
        </div>
      </div>
    </div>
  );
}
