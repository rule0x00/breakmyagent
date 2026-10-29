import { z } from 'zod';

// Deliberately basic: catches the obvious stuff, not a moderation system.
const BLOCKLIST = [
  'fuck', 'shit', 'cunt', 'bitch', 'nigg', 'fag', 'retard', 'whore', 'slut', 'rape',
  'nazi', 'hitler', 'penis', 'vagina', 'porn', 'dick', 'cock', 'pussy', 'asshole', 'admin',
];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '9': 'g' };

export function isProfane(nickname: string): boolean {
  const lower = nickname.toLowerCase();
  const folded = lower.replace(/[0-9]/g, (d) => LEET[d] ?? d).replace(/_/g, '');
  return BLOCKLIST.some((w) => lower.includes(w) || folded.includes(w));
}

export const nicknameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, 'Nickname must be 3-20 characters: letters, digits, underscore')
  .refine((n) => !isProfane(n), 'Please pick a different nickname');

export const guestSchema = z.object({ nickname: nicknameSchema });
export type GuestBody = z.infer<typeof guestSchema>;
