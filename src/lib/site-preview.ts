// Turns a web page's HTML into suggestions for posting an app: a name, a
// one-line tagline, a longer description and a best-guess category. Pure
// functions (no network), so they're easy to test.

import type { Category } from "./constants";

export type SitePreview = {
  name: string;
  tagline: string;
  description: string;
  category: Category | null;
};

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", "#39": "'" };

function decode(text: string): string {
  return text
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, code: string) => {
      const c = code.toLowerCase();
      if (c.startsWith("#x")) return String.fromCodePoint(parseInt(c.slice(2), 16) || 32);
      if (c.startsWith("#")) return String.fromCodePoint(parseInt(c.slice(1), 10) || 32);
      return ENTITIES[c] ?? m;
    })
    .replace(/\s+/g, " ")
    .trim();
}

// Meta tags keyed by property/name ("og:title", "description", …).
export function parseMeta(html: string): { title: string; meta: Record<string, string> } {
  const head = html.slice(0, 200_000);
  const meta: Record<string, string> = {};
  for (const tag of head.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs: Record<string, string> = {};
    for (const m of tag.matchAll(/([a-zA-Z:_-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/g)) {
      attrs[m[1].toLowerCase()] = m[3] ?? m[4] ?? m[5] ?? "";
    }
    const key = (attrs.property ?? attrs.name ?? "").toLowerCase();
    if (key && attrs.content && !(key in meta)) meta[key] = decode(attrs.content);
  }
  const titleMatch = head.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return { title: titleMatch ? decode(titleMatch[1]) : "", meta };
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–—-]+$/, "")}…`;
}

const SEPARATORS = /\s+[|–—·•:-]\s+/;

// Keywords that point at a category, checked in this order.
const CATEGORY_WORDS: [Category, RegExp][] = [
  ["dev-tools", /\b(developers?|api|sdk|cli|devops|deploy|github|code review|debug|database|open[- ]source)\b/i],
  ["ai", /\b(ai|a\.i\.|gpt|llm|machine learning|chatbot|agent|claude|generat(e|ive))\b/i],
  ["design", /\b(design|figma|color|colour|palette|font|typography|ui kit|mockup|icons?)\b/i],
  ["finance", /\b(finance|budget|money|invoice|expense|payments?|bill|crypto|invest|tax|split)\b/i],
  ["education", /\b(learn|learning|students?|teachers?|classroom|course|quiz|study|school|tutor)\b/i],
  ["health", /\b(health|fitness|workout|sleep|meditat|habit|diet|nutrition|mental)\b/i],
  ["games", /\b(game|games|play|puzzle|arcade|multiplayer)\b/i],
  ["social", /\b(social|community|friends|chat|dating|share with|network)\b/i],
  ["productivity", /\b(productivity|tasks?|to-?dos?|notes?|calendar|meeting|workflow|organi[sz]e|focus|planner)\b/i],
];

export function guessCategory(text: string): Category | null {
  for (const [category, pattern] of CATEGORY_WORDS) if (pattern.test(text)) return category;
  return null;
}

export function sitePreview(html: string, url: string): SitePreview {
  const { title, meta } = parseMeta(html);
  const ogTitle = meta["og:title"] ?? meta["twitter:title"] ?? "";
  const siteName = meta["og:site_name"] ?? meta["application-name"] ?? meta["apple-mobile-web-app-title"] ?? "";
  const description = meta["og:description"] ?? meta["description"] ?? meta["twitter:description"] ?? "";

  // "NoteFlow — Meeting notes that turn into to-dos" → name + tagline.
  const fullTitle = ogTitle || title;
  const [first, ...rest] = fullTitle.split(SEPARATORS);
  let name = siteName || first || "";
  if (!name) name = new URL(url).hostname.replace(/^www\./, "").split(".")[0];
  name = name.charAt(0).toUpperCase() + name.slice(1);
  const titleTail = rest.join(" · ");
  const tagline = titleTail && titleTail.toLowerCase() !== name.toLowerCase() ? titleTail : description;

  return {
    name: clip(name, 60),
    tagline: clip(tagline, 120),
    description: clip(description, 2000),
    category: guessCategory(`${fullTitle} ${description} ${meta["keywords"] ?? ""}`),
  };
}
