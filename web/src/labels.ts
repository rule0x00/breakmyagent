import type { BlockedBy } from './api/types';

export const TECHNIQUE_LABELS: Record<string, string> = {
  direct_ask: 'Direct ask',
  instruction_override: 'Instruction override',
  roleplay_persona: 'Role-play / persona',
  hypothetical_fiction: 'Hypothetical / fiction',
  encoding_obfuscation: 'Encoding / obfuscation',
  language_switch: 'Language switch',
  payload_splitting: 'Payload splitting',
  authority_social_engineering: 'Authority / social eng.',
  output_format_trick: 'Output-format trick',
  indirect_injection: 'Indirect injection',
  tool_abuse: 'Tool abuse',
  other: 'Other',
};

export const DEFENSE_LABELS: Record<BlockedBy, string> = {
  input_guard: 'Input guard',
  output_filter: 'Output filter',
  egress_filter: 'Egress filter',
};
