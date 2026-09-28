// The database's own messages (code P0001) are written for people, like the
// spam limit's "You're doing that too fast. Take a short break and try
// again." Show those as they are; anything else gets the fallback. Shared by
// the website and the phone app.
export function dbMessage(error: { code?: string; message?: string } | null | undefined, fallback: string): string {
  return error?.code === "P0001" && error.message ? withVCoin(error.message) : fallback;
}

// A few of the database's messages are older than the name V Coin ("That
// costs 50 credits and you have 20."). Say V Coin, like everywhere else.
export function withVCoin(message: string): string {
  return message.replace(/\bcredit pack\b/g, "V Coin pack").replace(/\bcredits\b/g, "V Coin");
}
