import { randomInt } from 'node:crypto';

const WORDS = [
  'MANGO', 'KIWI', 'PAPAYA', 'LEMON', 'CHERRY', 'GUAVA', 'LYCHEE', 'PEACH', 'PLUM', 'APRICOT',
  'FALCON', 'OTTER', 'BADGER', 'PANDA', 'LYNX', 'GECKO', 'HERON', 'BISON', 'KOALA', 'RAVEN',
  'COMET', 'NEBULA', 'QUASAR', 'ORBIT', 'PULSAR', 'METEOR', 'GALAXY', 'ECLIPSE', 'ZENITH', 'AURORA',
  'CEDAR', 'MAPLE', 'WILLOW', 'BIRCH', 'ASPEN', 'SPRUCE', 'CYPRESS', 'JUNIPER', 'LAUREL', 'HAZEL',
  'COBALT', 'AMBER', 'INDIGO', 'SCARLET', 'VIOLET', 'CRIMSON', 'SAFFRON', 'TEAL', 'OCHRE', 'IVORY',
  'TANGO', 'WALTZ', 'SAMBA', 'POLKA', 'RUMBA', 'BOLERO', 'MAMBO', 'SALSA', 'FOXTROT', 'LIMBO',
];

/** e.g. "MANGO-4821": a random word plus 4 random digits. */
export function generateSecret(): string {
  const word = WORDS[randomInt(WORDS.length)];
  const digits = randomInt(10_000).toString().padStart(4, '0');
  return `${word}-${digits}`;
}
