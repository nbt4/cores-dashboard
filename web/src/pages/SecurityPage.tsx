import { useState, useEffect } from 'react';
import { Shield, Key, Smartphone, Plus, Trash2, CheckCircle, XCircle, Copy, Eye, EyeOff } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';

const rentalApi = axios.create({
  baseURL: '/api/v1/proxy/rental/api/v1',
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

interface TwoFAStatus {
  enabled: boolean;
  verified: boolean;
  setupDate?: string;
  lastUsed?: string | null;
  backupCodesCount?: number;
}

interface TwoFASetup {
  qrCodeURL: string;
  secret: string;
  backupCodes: string[];
}

interface Passkey {
  passkeyID: number;
  name: string;
  createdAt: string;
  lastUsed?: string | null;
  isActive: boolean;
}

// base64url decode to Uint8Array
function b64urlToUint8(str: string): Uint8Array {
  const b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64);
  return Uint8Array.from(bin, c => c.charCodeAt(0));
}

// Uint8Array to base64url
function uint8ToB64url(arr: ArrayBuffer): string {
  const bytes = new Uint8Array(arr);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function TwoFASection() {
  const [status, setStatus] = useState<TwoFAStatus | null>(null);
  const [setup, setSetup] = useState<TwoFASetup | null>(null);
  const [step, setStep] = useState<'idle' | 'setup' | 'disable'>('idle');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');
  const [showSecret, setShowSecret] = useState(false);
  const [showBackupCodes, setShowBackupCodes] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  const loadStatus = async () => {
    try {
      const { data } = await rentalApi.get<TwoFAStatus>('/profile/2fa/status');
      setStatus(data);
    } catch { setStatus({ enabled: false, verified: false }); }
  };

  useEffect(() => { loadStatus(); }, []);

  const startSetup = async () => {
    setLoading(true); setMsg('');
    try {
      const { data } = await rentalApi.post<TwoFASetup>('/profile/2fa/setup');
      setSetup(data);
      setStep('setup');
      setCode('');
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? 'Fehler beim Setup.');
      setMsgType('err');
    } finally { setLoading(false); }
  };

  const verify = async () => {
    if (code.length !== 6) { setMsg('Bitte 6-stelligen Code eingeben.'); setMsgType('err'); return; }
    setLoading(true); setMsg('');
    try {
      await rentalApi.post('/profile/2fa/verify', { code });
      setMsg('2FA erfolgreich aktiviert!');
      setMsgType('ok');
      setStep('idle');
      setSetup(null);
      setCode('');
      await loadStatus();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? 'Ungültiger Code.');
      setMsgType('err');
    } finally { setLoading(false); }
  };

  const disable = async () => {
    if (code.length !== 6) { setMsg('Bitte 6-stelligen Code eingeben.'); setMsgType('err'); return; }
    setLoading(true); setMsg('');
    try {
      await rentalApi.post('/profile/2fa/disable', { code });
      setMsg('2FA deaktiviert.');
      setMsgType('ok');
      setStep('idle');
      setCode('');
      await loadStatus();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? 'Ungültiger Code.');
      setMsgType('err');
    } finally { setLoading(false); }
  };

  const copyBackupCodes = () => {
    if (!setup?.backupCodes) return;
    navigator.clipboard.writeText(setup.backupCodes.join('\n'));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2000);
  };

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Smartphone className="w-5 h-5 text-accent-red" />
        <h3 className="text-white font-semibold text-base">Zwei-Faktor-Authentifizierung (2FA)</h3>
      </div>

      {status && (
        <div className="flex items-center gap-2">
          {status.enabled ? (
            <CheckCircle className="w-4 h-4 text-green-400" />
          ) : (
            <XCircle className="w-4 h-4 text-gray-500" />
          )}
          <span className={`text-sm font-semibold ${status.enabled ? 'text-green-400' : 'text-gray-400'}`}>
            {status.enabled ? 'Aktiviert' : 'Deaktiviert'}
          </span>
          {status.enabled && status.backupCodesCount !== undefined && (
            <span className="text-xs text-gray-500 ml-2">· {status.backupCodesCount} Backup-Codes übrig</span>
          )}
        </div>
      )}

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${msgType === 'err' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
          {msg}
        </div>
      )}

      {/* Setup flow */}
      {step === 'setup' && setup && (
        <div className="space-y-4 border border-white/10 rounded-xl p-4">
          <p className="text-gray-300 text-sm">Scanne den QR-Code mit deiner Authenticator-App (z.B. Google Authenticator, Aegis).</p>

          <div className="flex justify-center p-4 bg-white rounded-xl w-fit mx-auto">
            <QRCodeSVG value={setup.qrCodeURL} size={180} />
          </div>

          <div className="space-y-1">
            <p className="text-gray-500 text-xs">Manueller Code:</p>
            <div className="flex items-center gap-2">
              <code className="text-xs text-gray-300 bg-white/5 px-2 py-1 rounded flex-1 font-mono break-all">
                {showSecret ? setup.secret : '••••••••••••••••••••••••••••••••'}
              </code>
              <button onClick={() => setShowSecret(s => !s)} className="p-1.5 hover:bg-white/10 rounded text-gray-400">
                {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {setup.backupCodes?.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-gray-400 text-sm font-semibold">Backup-Codes <span className="text-gray-500 font-normal">(sicher aufbewahren!)</span></p>
                <div className="flex gap-2">
                  <button onClick={() => setShowBackupCodes(s => !s)} className="text-xs text-gray-400 hover:text-white">
                    {showBackupCodes ? 'Ausblenden' : 'Anzeigen'}
                  </button>
                  <button onClick={copyBackupCodes} className="flex items-center gap-1 text-xs text-gray-400 hover:text-white">
                    <Copy className="w-3 h-3" />{copiedCodes ? 'Kopiert!' : 'Kopieren'}
                  </button>
                </div>
              </div>
              {showBackupCodes && (
                <div className="grid grid-cols-2 gap-1">
                  {setup.backupCodes.map((c, i) => (
                    <code key={i} className="text-xs text-gray-300 bg-white/5 px-2 py-1 rounded font-mono text-center">{c}</code>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <p className="text-gray-400 text-sm">Code aus der App eingeben zur Bestätigung:</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                className="flex-1 px-3 py-2 rounded-lg glass text-white text-center font-mono text-lg tracking-widest" />
              <button onClick={verify} disabled={loading || code.length !== 6}
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50 hover:opacity-90">
                {loading ? '...' : 'Aktivieren'}
              </button>
              <button onClick={() => { setStep('idle'); setSetup(null); setCode(''); setMsg(''); }}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold">
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Disable flow */}
      {step === 'disable' && (
        <div className="space-y-3 border border-red-500/30 rounded-xl p-4">
          <p className="text-gray-300 text-sm">Code aus der Authenticator-App eingeben um 2FA zu deaktivieren:</p>
          <div className="flex gap-2">
            <input type="text" inputMode="numeric" maxLength={6} placeholder="000000" value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              className="flex-1 px-3 py-2 rounded-lg glass text-white text-center font-mono text-lg tracking-widest" />
            <button onClick={disable} disabled={loading || code.length !== 6}
              className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50">
              {loading ? '...' : 'Deaktivieren'}
            </button>
            <button onClick={() => { setStep('idle'); setCode(''); setMsg(''); }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold">
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {step === 'idle' && (
        <div className="flex gap-2">
          {!status?.enabled ? (
            <button onClick={startSetup} disabled={loading}
              className="px-4 py-2 bg-accent-red text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50">
              {loading ? 'Lädt...' : '2FA einrichten'}
            </button>
          ) : (
            <button onClick={() => { setStep('disable'); setCode(''); setMsg(''); }}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg text-sm font-semibold hover:opacity-90">
              2FA deaktivieren
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function PasskeysSection() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [msg, setMsg] = useState('');
  const [msgType, setMsgType] = useState<'ok' | 'err'>('ok');

  const loadPasskeys = async () => {
    setLoading(true);
    try {
      const { data } = await rentalApi.get<{ passkeys: Passkey[] }>('/profile/passkeys');
      setPasskeys(data?.passkeys ?? []);
    } catch { setMsg('Passkeys konnten nicht geladen werden.'); setMsgType('err'); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadPasskeys(); }, []);

  const registerPasskey = async () => {
    setRegistering(true); setMsg('');
    try {
      const { data: opts } = await rentalApi.post<any>('/profile/passkeys/start-registration');

      // Decode challenge + user.id from base64url
      const publicKey: PublicKeyCredentialCreationOptions = {
        ...opts,
        challenge: b64urlToUint8(opts.challenge),
        user: { ...opts.user, id: b64urlToUint8(opts.user.id) },
        excludeCredentials: (opts.excludeCredentials ?? []).map((c: any) => ({
          ...c,
          id: b64urlToUint8(c.id),
        })),
      };

      const credential = await navigator.credentials.create({ publicKey }) as PublicKeyCredential;
      if (!credential) throw new Error('Passkey-Registrierung abgebrochen.');

      const response = credential.response as AuthenticatorAttestationResponse;
      await rentalApi.post('/profile/passkeys/complete-registration', {
        id: credential.id,
        rawId: uint8ToB64url(credential.rawId),
        type: credential.type,
        response: {
          attestationObject: uint8ToB64url(response.attestationObject),
          clientDataJSON: uint8ToB64url(response.clientDataJSON),
        },
        sessionId: opts.sessionId,
      });

      setMsg('Passkey erfolgreich registriert!');
      setMsgType('ok');
      await loadPasskeys();
    } catch (e: any) {
      if (e?.name === 'NotAllowedError') {
        setMsg('Passkey-Registrierung vom Benutzer abgebrochen.');
      } else {
        setMsg(e?.response?.data?.error ?? e?.message ?? 'Registrierung fehlgeschlagen.');
      }
      setMsgType('err');
    } finally { setRegistering(false); }
  };

  const removePasskey = async (pk: Passkey) => {
    if (!confirm(`Passkey "${pk.name}" wirklich löschen?`)) return;
    try {
      await rentalApi.delete(`/profile/passkeys/${pk.passkeyID}`);
      await loadPasskeys();
    } catch (e: any) {
      setMsg(e?.response?.data?.error ?? 'Löschen fehlgeschlagen.');
      setMsgType('err');
    }
  };

  const fmt = (d?: string | null) => d ? new Date(d).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '–';

  return (
    <div className="glass rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Key className="w-5 h-5 text-accent-red" />
          <h3 className="text-white font-semibold text-base">Passkeys</h3>
        </div>
        <button onClick={registerPasskey} disabled={registering}
          className="px-3 py-1.5 bg-accent-red text-white rounded-lg text-sm font-semibold flex items-center gap-1.5 hover:opacity-90 disabled:opacity-50">
          <Plus className="w-3.5 h-3.5" />{registering ? 'Lädt...' : 'Passkey hinzufügen'}
        </button>
      </div>

      <p className="text-gray-400 text-sm">
        Passkeys ermöglichen passwortlosen Login über Fingerabdruck, Gesichtserkennung oder Hardware-Key.
      </p>

      {msg && (
        <div className={`px-3 py-2 rounded-lg text-sm font-semibold ${msgType === 'err' ? 'bg-red-500/20 text-red-300' : 'bg-green-500/20 text-green-300'}`}>
          {msg}
        </div>
      )}

      {loading ? (
        <p className="text-gray-400 text-sm">Lädt...</p>
      ) : (
        <div className="space-y-2">
          {passkeys.map(pk => (
            <div key={pk.passkeyID} className="flex items-center justify-between p-3 rounded-xl"
              style={{ background: 'var(--surface-2)', border: '1px solid var(--border-subtle)' }}>
              <div>
                <p className="text-white text-sm font-semibold">{pk.name}</p>
                <p className="text-gray-500 text-xs">Erstellt: {fmt(pk.createdAt)} · Zuletzt: {fmt(pk.lastUsed)}</p>
              </div>
              <button onClick={() => removePasskey(pk)}
                className="p-1.5 hover:bg-white/10 rounded-lg text-red-400">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {passkeys.length === 0 && (
            <p className="text-gray-500 text-sm">Noch keine Passkeys registriert.</p>
          )}
        </div>
      )}
    </div>
  );
}

export function SecurityPage() {
  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Shield className="w-6 h-6 text-accent-red" />
        <h1 className="text-white font-bold text-xl">Kontosicherheit</h1>
      </div>
      <TwoFASection />
      <PasskeysSection />
    </div>
  );
}
