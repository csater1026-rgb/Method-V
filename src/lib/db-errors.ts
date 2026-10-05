// The database's own messages (code P0001) are written for people, like the
// spam limit's "You're doing that too fast. Take a short break and try
// again." Show those as they are; anything else gets the fallback. Shared by
// the website and the phone app.
export function dbMessage(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  return error?.code === "P0001" && error.message ? withMethodium(error.message) : fallback;
}

// The database's messages are older than the name Methodium: some say
// credits ("That costs 50 credits and you have 20."), newer ones V Coin, its
// first name. Say Methodium, like everywhere else.
export function withMethodium(message: string): string {
  return message
    .replace(/\bcredit pack\b/g, "Methodium pack")
    .replace(/\bcredits\b/g, "Methodium")
    .replace(/\bV Coin\b/g, "Methodium");
}
