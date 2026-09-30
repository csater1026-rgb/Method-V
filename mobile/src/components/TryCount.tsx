import { formatCount } from "@shared/format";

import { useTryCount } from "@/lib/tryCount";

// An app's live try count, as text (put it inside a <Text>).
export function TryCount({ appId, count }: { appId: string; count: number }) {
  return <>{formatCount(useTryCount(appId, count))}</>;
}
