import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

          {/* Logo */}
          <div className="flex flex-col items-center gap-3">
            <img
              src="/logos/cores_white_side.svg"
              alt="Cores"
              className="h-20"
              style={{ filter: 'drop-shadow(0 0 18px rgba(var(--accent-red-rgb), 0.3))' }}
            />
            <p className="text-gray-500 text-xs">Management System</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
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
            {error && <p className="text-red-400 text-sm text-center">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-white transition-all disabled:opacity-50"
              style={{ background: 'var(--accent-red)', boxShadow: '0 0 16px rgba(var(--accent-red-rgb), 0.25)' }}
            >
              {loading ? 'Anmelden...' : 'Anmelden'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
