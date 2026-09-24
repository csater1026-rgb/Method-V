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
    feedback_given_count: 23,
    feedback_helpful_count: 9,
    connection_count: 12,
    reputation: 31,
    pro_until: "2099-01-01T00:00:00.000Z",
    pinned_app_id: "demo-app-noteflow",
    payouts_enabled: true,
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
    feedback_given_count: 41,
    feedback_helpful_count: 17,
    connection_count: 7,
    reputation: 58,
    pro_until: null,
    pinned_app_id: null,
    payouts_enabled: true,
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
    feedback_given_count: 8,
    feedback_helpful_count: 3,
    connection_count: 24,
    reputation: 12,
    pro_until: null,
    pinned_app_id: null,
    payouts_enabled: false,
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
    feedback_count: 18,
    would_use_yes_count: 14,
    rating_sum: 79,
    launch_at: null,
    boosted_until: null,
    backer_count: 12,
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
    feedback_count: 6,
    would_use_yes_count: 4,
    rating_sum: 25,
    launch_at: null,
    boosted_until: null,
    backer_count: 3,
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
    feedback_count: 31,
    would_use_yes_count: 27,
    rating_sum: 142,
    launch_at: null,
    boosted_until: null,
    backer_count: 0,
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
    feedback_count: 0,
    would_use_yes_count: 0,
    rating_sum: 0,
    launch_at: null,
    boosted_until: null,
    backer_count: 1,
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

// Build-in-public updates.
export const demoUpdates: { user: string; app: string | null; body: string; hours: number }[] = [
  { user: "demo-ada", app: "demo-app-noteflow", body: "Shipped Google Meet import today. 3 people asked for it in the comments, so here it is.", hours: 2 },
  { user: "demo-marco", app: "demo-app-quizpop", body: "Launch day for QuizPop is set! Spent the weekend on the class leaderboard.", hours: 9 },
  { user: "demo-june", app: null, body: "Hiring a front-end dev for my studio. If you build with React and care about color, say hi.", hours: 26 },
  { user: "demo-ada", app: "demo-app-splitsy", body: "Receipt scanning now works on crumpled receipts too. Tested on 40 of my own.", hours: 50 },
];

// Q&A on apps.
export const demoQuestions: Record<
  string,
  { user: string; body: string; votes: number; answers: { user: string; body: string; votes: number; best?: boolean }[] }[]
> = {
  "demo-app-noteflow": [
    {
      user: "demo-marco",
      body: "Does it work with Google Meet recordings, or only Zoom?",
      votes: 6,
      answers: [
        { user: "demo-ada", body: "Both! Meet import shipped this week. Drop the recording link in and it does the rest.", votes: 4, best: true },
        { user: "demo-june", body: "Can confirm, used it on a Meet call yesterday.", votes: 1 },
      ],
    },
    { user: "demo-june", body: "Is there a way to export the to-dos to Linear?", votes: 3, answers: [] },
  ],
};

// Accepted shoutout swaps between apps.
export const demoSwaps: [string, string][] = [["demo-app-noteflow", "demo-app-palettepal"]];

// Hand-picked for the Featured row on the home feed.
export const demoFeaturedIds = ["demo-app-palettepal", "demo-app-noteflow"];

// Launch days and boosts, relative to now so the countdowns always make sense.
export function demoSchedule(now = Date.now()): Record<string, { launch_at?: string; boosted_until?: string }> {
  const h = 60 * 60 * 1000;
  return {
    "demo-app-splitsy": { launch_at: new Date(now - 3 * h).toISOString() },
    "demo-app-quizpop": {
      launch_at: new Date(now + 2 * 24 * h + 4 * h).toISOString(),
      boosted_until: new Date(now + 2 * 24 * h).toISOString(),
    },
  };
}

// Apps waiting for testers in the "Test & earn" queue.
export const demoTestRequests: Record<string, { slots_total: number; slots_filled: number }> = {
  "demo-app-quizpop": { slots_total: 10, slots_filled: 6 },
  "demo-app-splitsy": { slots_total: 5, slots_filled: 0 },
};

// Phase 4 samples.
export const demoBackers: Record<string, { user: string; note: string; days: number }[]> = {
  "demo-app-noteflow": [
    { user: "demo-marco", note: "Saves me every Monday standup.", days: 1 },
    { user: "demo-june", note: "", days: 5 },
  ],
  "demo-app-quizpop": [{ user: "demo-ada", note: "My niece's class loves it!", days: 2 }],
};

// host app -> sponsor (an app, or a brand from demoBrands)
export const demoSponsors: Record<string, string> = {
  "demo-app-quizpop": "demo-app-noteflow",
  "demo-app-palettepal": "demo-brand-pixelhost",
};

export const demoBrands = [
  {
    id: "demo-brand-pixelhost",
    owner_id: "demo-june",
    slug: "pixelhost",
    name: "PixelHost",
    tagline: "Hosting for side projects, free until you get users",
    description: "A sample brand, to show how companies outside Method V sponsor apps on the Boost Exchange.",
    url: "https://example.com",
    verified: true,
    created_at: ago(20),
  },
];

export const demoChallenges = [
  {
    id: "demo-challenge-supabase",
    slug: "best-supabase-app",
    title: "Best app built on Supabase",
    body: "Ship something real on Supabase this month. Entries are ranked by community votes; the sponsor picks the winner from the top five.",
    sponsor_name: "Method V",
    sponsor_url: null,
    prize: "$500 + a week on the Home spotlight",
    stack: "Supabase",
    category: null,
    startsDays: -5,
    endsDays: 9,
    entries: [
      { id: "demo-entry-noteflow", app: "demo-app-noteflow", votes: 23 },
      { id: "demo-entry-quizpop", app: "demo-app-quizpop", votes: 17 },
    ],
  },
  {
    id: "demo-challenge-teachers",
    slug: "build-for-teachers",
    title: "Build something teachers use on Monday",
    body: "Education tools only. Keep it simple enough for a teacher to start in under a minute.",
    sponsor_name: "Brightboard (sample sponsor)",
    sponsor_url: null,
    prize: "$300 and a feature in the Brightboard newsletter",
    stack: null,
    category: "education",
    startsDays: -2,
    endsDays: 20,
    entries: [{ id: "demo-entry-quizpop-2", app: "demo-app-quizpop", votes: 8 }],
  },
];

export const demoDay = ago;
