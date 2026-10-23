// Pure so it can be unit tested without native modules. Mirror any change in supabase/README.md.
export type PasswordRule = { label: string; met: boolean };

export function passwordRules(pw: string): PasswordRule[] {
  return [
    { label: 'At least 12 characters', met: pw.length >= 12 },
    { label: 'An uppercase letter', met: /[A-Z]/.test(pw) },
    { label: 'A lowercase letter', met: /[a-z]/.test(pw) },
    { label: 'A number', met: /\d/.test(pw) },
    { label: 'A symbol', met: /[^A-Za-z0-9]/.test(pw) },
  ];
}
