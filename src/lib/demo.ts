// Sample content shown when Supabase isn't connected, so the site can be
// clicked through before any setup. Nothing here is written anywhere.

import type { App, Drop, Profile } from "./types";

export const demoProfiles: Profile[] = [
  {
    id: "demo-ada",
    username: "ada_builds",
    display_name: "Ada Park",
    bio: "Solo founder. I build small tools that save people an hour a week.",
    roles: ["founder", "open_to_collab"],
    skills: ["Next.js", "Supabase", "Product design"],
    website_url: "https://example.com",
    x_handle: "ada_builds",
    github_handle: "ada-builds",
    linkedin_url: null,
    follower_count: 214,
    following_count: 38,
  },
  {
    id: "demo-marco",
    username: "marco_ships",
    display_name: "Marco Díaz",
    bio: "Vibe coder, ex-teacher. Building things for classrooms.",
    roles: ["looking_for_work", "freelancer"],
    skills: ["Lovable", "Tailwind", "Teaching"],
    website_url: null,
    x_handle: null,
    github_handle: "marco-ships",
    linkedin_url: null,
    follower_count: 87,
    following_count: 120,
  },
  {
    id: "demo-june",
    username: "june_designs",
    display_name: "June Okafor",
    bio: "Designer who learned to code. Hiring a front-end dev for my studio.",
    roles: ["hiring", "founder"],
    skills: ["Figma", "Motion", "React"],
    website_url: "https://example.com",
    x_handle: null,
    github_handle: null,
    linkedin_url: null,
    follower_count: 1032,
    following_count: 76,
  },
];

const day = 24 * 60 * 60 * 1000;
const ago = (days: number) => new Date(Date.UTC(2026, 8, 23) - days * day).toISOString();

export const demoApps: App[] = [
  {
    id: "demo-app-noteflow",
    owner_id: "demo-ada",
    slug: "noteflow",
    name: "NoteFlow",
    tagline: "Meeting notes that turn into to-dos on their own",
    description:
      "Paste or record a meeting and NoteFlow pulls out decisions, owners and deadlines, then drops them into your task list.",
    url: "https://example.com",
    category: "productivity",
    tech_stack: ["Next.js", "Supabase", "Claude"],
    pricing: "freemium",
    stage: "launched",
    try_count: 412,
    like_count: 96,
    created_at: ago(1),
  },
  {
    id: "demo-app-quizpop",
    owner_id: "demo-marco",
    slug: "quizpop",
    name: "QuizPop",
    tagline: "Turn any lesson into a 5-question quiz in seconds",
    description: "Built for teachers. Paste a reading, get a quiz your class can join from their phones.",
    url: "https://example.com",
    category: "education",
    tech_stack: ["Lovable", "Supabase"],
    pricing: "free",
    stage: "beta",
    try_count: 158,
    like_count: 41,
    created_at: ago(3),
  },
  {
    id: "demo-app-palettepal",
    owner_id: "demo-june",
    slug: "palettepal",
    name: "PalettePal",
    tagline: "Accessible color palettes from one brand color",
    description: "Pick a color and get a full palette that passes contrast checks in light and dark mode.",
    url: "https://example.com",
    category: "design",
    tech_stack: ["React", "Vite"],
    pricing: "free",
    stage: "launched",
    try_count: 890,
    like_count: 233,
    created_at: ago(6),
  },
  {
    id: "demo-app-splitsy",
    owner_id: "demo-ada",
    slug: "splitsy",
    name: "Splitsy",
    tagline: "Split a group bill from a photo of the receipt",
    description: "Snap the receipt, tap who had what, and everyone gets a payment link.",
    url: "https://example.com",
    category: "finance",
    tech_stack: ["Next.js", "Stripe"],
    pricing: "free",
    stage: "idea",
    try_count: 37,
    like_count: 12,
    created_at: ago(9),
  },
];

export const demoDrops: Drop[] = demoApps.map((app, i) => ({
  id: `demo-drop-${app.slug}`,
  app_id: app.id,
  owner_id: app.owner_id,
  video_url: null,
  poster_url: null,
  duration_seconds: [48, 32, 55, 27][i] ?? 45,
  caption: [
    "Recorded a real standup and let NoteFlow do the rest 👀",
    "My students made 30 quizzes in the first week",
    "One color in, a whole accessible palette out",
    "Dinner with 6 friends, settled in 20 seconds",
  ][i] ?? "",
  like_count: app.like_count,
  comment_count: [14, 6, 31, 2][i] ?? 0,
  created_at: app.created_at,
}));

export const demoComments: Record<string, { user: string; body: string; days: number }[]> = {
  "demo-drop-noteflow": [
    { user: "demo-june", body: "The auto-assigning owners part is so good.", days: 1 },
    { user: "demo-marco", body: "Does it work with Google Meet recordings?", days: 0.5 },
  ],
  "demo-drop-palettepal": [{ user: "demo-ada", body: "Using this for my next launch page.", days: 4 }],
};

export const demoCommentDate = ago;
