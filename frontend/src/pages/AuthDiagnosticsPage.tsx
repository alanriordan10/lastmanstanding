import { useCallback, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import api, { getErrorMessage } from '../api';

type ProbePayload = {
  hadProbeCookie: boolean;
  hasAccessTokenCookie: boolean;
  hasRefreshTokenCookie: boolean;
  secure: boolean;
  sameSite: string;
  host: string | null;
  origin: string | null;
  forwardedProto: string | null;
  userAgent: string | null;
};

type ProbeCheckResult = {
  label: string;
  ok: boolean;
};

type StepStatus = {
  firstProbe?: ProbePayload;
  secondProbe?: ProbePayload;
  meStatus?: number;
  meMessage?: string;
  error?: string;
};

export default function AuthDiagnosticsPage() {
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState<StepStatus>({});

  const runChecks = useCallback(async () => {
    setRunning(true);
    setStatus({});

    try {
      const first = await api.get<ProbePayload>('/auth/cookie-probe');
      const second = await api.get<ProbePayload>('/auth/cookie-probe');

      let meStatus: number | undefined;
      let meMessage: string | undefined;
      try {
        await api.get('/auth/me', { _skipAuthRedirect: true } as any);
        meStatus = 200;
        meMessage = 'Authenticated';
      } catch (err: any) {
        meStatus = err?.response?.status;
        meMessage = getErrorMessage(err, 'Unable to call /auth/me');
      }

      setStatus({
        firstProbe: first.data,
        secondProbe: second.data,
        meStatus,
        meMessage,
      });
    } catch (err: any) {
      setStatus({ error: getErrorMessage(err, 'Failed to run diagnostics') });
    } finally {
      setRunning(false);
    }
  }, []);

  const checks: ProbeCheckResult[] = useMemo(() => {
    if (!status.firstProbe || !status.secondProbe) return [];
    return [
      {
        label: 'Probe cookie returns on second request',
        ok: status.secondProbe.hadProbeCookie,
      },
      {
        label: 'Auth cookies present (AT/RT) after login',
        ok: status.secondProbe.hasAccessTokenCookie && status.secondProbe.hasRefreshTokenCookie,
      },
      {
        label: 'Cookie policy secure + SameSite=None',
        ok: status.secondProbe.secure && status.secondProbe.sameSite === 'None',
      },
      {
        label: '/auth/me authenticated',
        ok: status.meStatus === 200,
      },
    ];
  }, [status.firstProbe, status.secondProbe, status.meStatus]);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5">
      <section className="card space-y-3">
        <h1 className="text-2xl font-bold text-white">Auth Diagnostics</h1>
        <p className="text-sm text-gray-300">
          Run this on your mobile browser to verify whether cookies are being stored/sent. It calls
          <code className="mx-1 rounded bg-black/30 px-1 py-0.5 text-xs">/auth/cookie-probe</code>
          twice and then checks
          <code className="mx-1 rounded bg-black/30 px-1 py-0.5 text-xs">/auth/me</code>.
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={runChecks} disabled={running} className="btn-primary">
            {running ? 'Running checks...' : 'Run diagnostics'}
          </button>
          <Link to="/login" className="btn-secondary">
            Go to login
          </Link>
        </div>
      </section>

      {status.error ? (
        <section className="card border border-red-500/40 text-red-200">
          <p className="font-medium">Diagnostics failed</p>
          <p className="text-sm">{status.error}</p>
        </section>
      ) : null}

      {checks.length > 0 ? (
        <section className="card space-y-3">
          <h2 className="text-lg font-semibold text-white">Results</h2>
          <div className="space-y-2 text-sm">
            {checks.map((item) => (
              <p key={item.label} className={item.ok ? 'text-emerald-300' : 'text-amber-300'}>
                {item.ok ? 'PASS' : 'FAIL'} - {item.label}
              </p>
            ))}
          </div>
          <p className="text-xs text-gray-400">
            If probe cookie fails on request #2, browser/storage settings are blocking cookies for this origin.
          </p>
        </section>
      ) : null}

      <section className="card space-y-3">
        <h2 className="text-lg font-semibold text-white">Raw response data</h2>
        <JsonPanel title="Probe request #1" payload={status.firstProbe} />
        <JsonPanel title="Probe request #2" payload={status.secondProbe} />
        <JsonPanel
          title="/auth/me"
          payload={
            status.meStatus == null
              ? undefined
              : {
                  status: status.meStatus,
                  message: status.meMessage,
                }
          }
        />
      </section>
    </div>
  );
}

function JsonPanel({ title, payload }: { title: string; payload: unknown }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-3">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-300">{title}</p>
      <pre className="overflow-x-auto text-xs text-gray-200">{JSON.stringify(payload ?? {}, null, 2)}</pre>
    </div>
  );
}

