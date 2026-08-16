import { useMemo } from 'react';
import { ZxcvbnFactory, type ZxcvbnResult } from '@zxcvbn-ts/core';
import * as zxcvbnCommonPackage from '@zxcvbn-ts/language-common';
import * as zxcvbnEnPackage from '@zxcvbn-ts/language-en';

const zxcvbn = new ZxcvbnFactory({
  dictionary: {
    ...zxcvbnCommonPackage.dictionary,
    ...zxcvbnEnPackage.dictionary,
  },
  translations: zxcvbnEnPackage.translations,
});

export type Strength = 0 | 1 | 2 | 3 | 4;

function scoreFromResult(result: ZxcvbnResult): Strength {
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
  const result = zxcvbn.check(password, userInputs ?? []);
  return {
    score: scoreFromResult(result),
    warning: result.feedback.warning || null,
    suggestions: result.feedback.suggestions || [],
  };
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
  const evalResult = useMemo<ZxcvbnResult | null>(() => {
    if (!password) return null;
    return zxcvbn.check(password, [email, username].filter(Boolean) as string[]);
  }, [password, email, username]);

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
  const result = zxcvbn.check(password, [email, username].filter(Boolean) as string[]);
  return result.score >= minScore;
}