import { useEffect, useMemo, useState } from 'react';

type PasswordFeedback = {
  warning: string;
  suggestions: string[];
};

type PasswordEvaluation = {
  score: number;
  feedback: PasswordFeedback;
};

type ZxcvbnModule = {
  check(password: string, userInputs?: string[]): PasswordEvaluation;
};

let zxcvbnPromise: Promise<ZxcvbnModule> | null = null;

function normalizePasswordEvaluation(result: {
  score: number;
  feedback?: {
    warning?: string | null;
    suggestions?: string[] | null;
  } | null;
}): PasswordEvaluation {
  return {
    score: result.score,
    feedback: {
      warning: result.feedback?.warning ?? '',
      suggestions: result.feedback?.suggestions ?? [],
    },
  };
}

async function loadZxcvbn(): Promise<ZxcvbnModule> {
  if (!zxcvbnPromise) {
    zxcvbnPromise = Promise.all([
      import('@zxcvbn-ts/core'),
      import('@zxcvbn-ts/language-common'),
      import('@zxcvbn-ts/language-en'),
    ]).then(([core, common, en]) => {
      const factory = new core.ZxcvbnFactory({
        dictionary: {
          ...common.dictionary,
          ...en.dictionary,
        },
        translations: en.translations,
      });

      return {
        check(password: string, userInputs: string[] = []) {
          return normalizePasswordEvaluation(factory.check(password, userInputs));
        },
      } satisfies ZxcvbnModule;
    });
  }
  return zxcvbnPromise;
}

export type Strength = 0 | 1 | 2 | 3 | 4;

function evaluatePasswordHeuristically(password: string, userInputs: string[] = []): PasswordEvaluation {
  const value = password ?? '';
  const lowered = value.toLowerCase();
  const normalizedInputs = userInputs.map((entry) => entry.toLowerCase()).filter(Boolean);

  const suggestions: string[] = [];
  let warning = '';
  let score = 0;

  if (value.length >= 8) score += 1;
  else suggestions.push('Use at least 8 characters.');

  if (value.length >= 12) score += 1;
  else suggestions.push('Use 12+ characters for better protection.');

  const hasLower = /[a-z]/.test(value);
  const hasUpper = /[A-Z]/.test(value);
  const hasDigit = /\d/.test(value);
  const hasSymbol = /[^a-zA-Z0-9]/.test(value);

  if (hasLower && hasUpper) score += 1;
  else suggestions.push('Mix uppercase and lowercase letters.');

  if (hasDigit && hasSymbol) score += 1;
  else suggestions.push('Add at least one number and one symbol.');

  if (/(.)\1\1/.test(value)) {
    score = Math.max(0, score - 1);
    warning = 'Avoid repeating the same character several times.';
  }

  const containsPersonalInfo = normalizedInputs.some((input) => input.length >= 3 && lowered.includes(input));
  if (containsPersonalInfo) {
    score = Math.max(0, score - 2);
    warning = 'Avoid using your email, username, or personal details in your password.';
  }

  if (/^(password|qwerty|123456|letmein|welcome)/i.test(value)) {
    score = Math.max(0, score - 2);
    warning = 'This password pattern is too common.';
  }

  return {
    score: Math.min(4, Math.max(0, score)),
    feedback: {
      warning,
      suggestions,
    },
  };
}

function scoreFromResult(result: PasswordEvaluation): Strength {
  return Math.min(4, Math.max(0, result.score)) as Strength;
}

const strengthLabels: Record<Strength, string> = {
  0: 'Very weak',
  1: 'Weak',
  2: 'Fair',
  3: 'Strong',
  4: 'Very strong',
};

const strengthColors: Record<Strength, string> = {
  0: 'bg-red-500',
  1: 'bg-red-500',
  2: 'bg-amber-500',
  3: 'bg-emerald-500',
  4: 'bg-emerald-500',
};

const strengthTextColors: Record<Strength, string> = {
  0: 'text-red-400',
  1: 'text-red-400',
  2: 'text-amber-300',
  3: 'text-emerald-300',
  4: 'text-emerald-300',
};

export function evaluatePassword(password: string, userInputs?: string[]): {
  score: Strength;
  warning: string | null;
  suggestions: string[];
} {
  if (!password) {
    return { score: 0, warning: null, suggestions: [] };
  }
  const result = evaluatePasswordHeuristically(password, userInputs ?? []);
  return {
    score: scoreFromResult(result),
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions || [],
  };
}

export async function validatePasswordStrength(
  password: string,
  email?: string,
  username?: string,
  minScore: Strength = 3,
): Promise<boolean> {
  if (!password) return false;
  const zxcvbn = await loadZxcvbn();
  const result = zxcvbn.check(password, [email, username].filter(Boolean) as string[]);
  return result.score >= minScore;
}

export function PasswordStrengthMeter({
  password,
  email,
  username,
  minScore = 3,
}: {
  password: string;
  email?: string;
  username?: string;
  minScore?: Strength;
}) {
  const [preciseResult, setPreciseResult] = useState<PasswordEvaluation | null>(null);

  const fallbackResult = useMemo<PasswordEvaluation | null>(() => {
    if (!password) return null;
    return evaluatePasswordHeuristically(password, [email, username].filter(Boolean) as string[]);
  }, [password, email, username]);

  useEffect(() => {
    let cancelled = false;

    if (!password) {
      setPreciseResult(null);
      return;
    }

    setPreciseResult(null);
    loadZxcvbn()
      .then((zxcvbn) => {
        if (cancelled) return;
        setPreciseResult(zxcvbn.check(password, [email, username].filter(Boolean) as string[]));
      })
      .catch(() => {
        if (cancelled) return;
        setPreciseResult(null);
      });

    return () => {
      cancelled = true;
    };
  }, [password, email, username]);

  const evalResult = preciseResult ?? fallbackResult;

  if (!password || !evalResult) return null;

  const score = scoreFromResult(evalResult);
  const label = strengthLabels[score];
  const color = strengthColors[score];
  const textColor = strengthTextColors[score];
  const meetsMinimum = score >= minScore;

  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="flex h-1 flex-1 gap-0.5">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`flex-1 rounded-full transition-colors ${
                i <= score ? color : 'bg-slate-800'
              }`}
            />
          ))}
        </div>
        <span className={`text-xs font-semibold ${textColor}`}>{label}</span>
      </div>
      {evalResult.feedback.warning && (
        <p className="text-xs text-amber-300">{evalResult.feedback.warning}</p>
      )}
      {!meetsMinimum && evalResult.feedback.suggestions && evalResult.feedback.suggestions.length > 0 && (
        <p className="text-xs text-slate-400">{evalResult.feedback.suggestions[0]}</p>
      )}
    </div>
  );
}

export function isPasswordStrongEnough(password: string, email?: string, username?: string, minScore: Strength = 3): boolean {
  if (!password) return false;
  const result = evaluatePasswordHeuristically(password, [email, username].filter(Boolean) as string[]);
  return result.score >= minScore;
}