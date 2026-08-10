import { cookies, headers } from "next/headers";
import {
  DEFAULT_LOCALE,
  getMessages,
  isLocale,
  Locale,
  LOCALE_COOKIE,
  translate,
} from "./config";

// The locale for this request: the person's saved choice if they have one,
// otherwise their browser's preference, otherwise Spanish (Madrid first).
export async function getLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  const saved = cookieStore.get(LOCALE_COOKIE)?.value;
  if (isLocale(saved)) return saved;

  const accept = (await headers()).get("accept-language") ?? "";
  return detectFromAcceptLanguage(accept);
}

// "es-ES,es;q=0.9,en-GB;q=0.8" -> the first language we actually support. A
// Spanish-preferring browser gets Spanish, an English one gets English, and
// anything else falls through to the default rather than guessing.
function detectFromAcceptLanguage(header: string): Locale {
  const langs = header.split(",").map((part) => part.trim().split(";")[0].toLowerCase());
  for (const lang of langs) {
    if (lang.startsWith("es")) return "es";
    if (lang.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

// For translating inside Server Components. Client components use useT().
export async function getServerT() {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return {
    locale,
    t: (key: string, vars?: Record<string, string | number>) => translate(messages, key, vars),
  };
}
