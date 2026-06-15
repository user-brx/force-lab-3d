// Idioma global. Mantido fora do React para que o núcleo de física (que roda
// a cada frame) também possa traduzir suas strings sem props extras.
// O store atualiza LANG via setLang(); a UI re-renderiza por depender de store.lang.

export type Lang = "pt" | "en";

export let LANG: Lang = "pt";

export function setLang(l: Lang) {
  LANG = l;
}

/** Escolhe a string conforme o idioma atual. */
export const L = (pt: string, en: string): string => (LANG === "en" ? en : pt);

/** Locale para formatação de números. */
export const locale = (): string => (LANG === "en" ? "en-US" : "pt-BR");
