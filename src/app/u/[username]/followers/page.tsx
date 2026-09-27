import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { FollowList } from "@/components/FollowList";
import { getFollowList } from "@/lib/data";

export async function generateMetadata({ params }: PageProps<"/u/[username]/followers">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username} · Followers` };
}

export default async function Page({ params }: PageProps<"/u/[username]/followers">) {
  const { username } = await params;
  const list = await getFollowList(username, "followers");
  if (!list) notFound();
  return <FollowList list={list} kind="followers" />;
}
