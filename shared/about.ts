export const ABOUT_LINKS = {
  author: 'https://github.com/Mr-Q526',
  repository: 'https://github.com/Mr-Q526/Cursorama',
  feedback: 'https://github.com/Mr-Q526/Cursorama/issues',
} as const;

export type AboutLink = keyof typeof ABOUT_LINKS;

export function resolveAboutLink(value: unknown): string | null {
  return typeof value === 'string' && Object.hasOwn(ABOUT_LINKS, value) ? ABOUT_LINKS[value as AboutLink] : null;
}
