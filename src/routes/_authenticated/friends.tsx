import { createFileRoute } from "@tanstack/react-router";
import { Check, Copy, UserPlus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatabaseErrorNotice } from "@/components/database-error-notice";
import { Input } from "@/components/ui/input";
import {
  useBlockFriend,
  useRemoveFriend,
  useRespondFriendRequest,
  useSendFriendRequest,
  useSocialOverview,
  useUnblockFriend,
  useUpdateSocialSettings,
} from "@/lib/data";
import type { SocialOverview } from "@/lib/social-types";
import { normalizeFriendCode } from "@/lib/social";
import { getLevelProgress } from "@/lib/gamification";

export const Route = createFileRoute("/_authenticated/friends")({
  head: () => ({ meta: [{ title: "Friends — Balance" }] }),
  component: Friends,
});

function Friends() {
  const overview = useSocialOverview();
  const saveSettings = useUpdateSocialSettings();
  const sendRequest = useSendFriendRequest();
  const respondRequest = useRespondFriendRequest();
  const removeFriend = useRemoveFriend();
  const blockFriend = useBlockFriend();
  const unblockFriend = useUnblockFriend();
  const initialized = useRef(false);
  const [displayName, setDisplayName] = useState("");
  const [shareProgress, setShareProgress] = useState(false);
  const [sharePresence, setSharePresence] = useState(false);
  const [friendCode, setFriendCode] = useState("");
  const rankedFriends = (overview.data?.friends ?? [])
    .filter((friend) => friend.total_xp !== null && friend.level !== null)
    .sort((left, right) => (right.total_xp ?? 0) - (left.total_xp ?? 0));
  const hiddenProgressFriends = (overview.data?.friends ?? []).filter(
    (friend) => friend.total_xp === null || friend.level === null,
  );

  useEffect(() => {
    if (!overview.data || initialized.current) return;
    initialized.current = true;
    setDisplayName(overview.data.profile.display_name);
    setShareProgress(overview.data.profile.share_progress);
    setSharePresence(overview.data.profile.share_presence);
  }, [overview.data]);

  const saveProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      await saveSettings.mutateAsync({ displayName, shareProgress, sharePresence });
      toast.success("Friend profile saved");
    } catch {
      // Mutation reports the backend error.
    }
  };

  const addFriend = async (event: React.FormEvent) => {
    event.preventDefault();
    const code = normalizeFriendCode(friendCode);
    if (!code) {
      toast.error("Enter a 6-digit friend ID.");
      return;
    }
    try {
      const result = await sendRequest.mutateAsync(code);
      const messages: Record<string, { title: string; description?: string }> = {
        sent: { title: "Friend request sent" },
        accepted: { title: "You're now friends" },
        already_friends: { title: "Already friends" },
        request_pending: { title: "Request already sent" },
        blocked: { title: "This account can't receive a friend request." },
        not_found: { title: "No account has that friend ID." },
        invalid_code: { title: "Enter a valid 6-digit friend ID." },
        self: { title: "You can't add your own ID." },
        rate_limited: {
          title: "Too many attempts",
          description: "Please wait before trying another friend ID.",
        },
      };
      const message = messages[result] ?? { title: "Friend request could not be sent." };
      if (result === "sent" || result === "accepted") {
        toast.success(message.title);
        setFriendCode("");
      } else {
        toast.error(message.title, { description: message.description });
      }
    } catch {
      // Mutation reports the backend error.
    }
  };

  const copyCode = async () => {
    const code = overview.data?.profile.friend_code;
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      toast.success("Friend ID copied");
    } catch {
      toast.error("Could not copy the friend ID. Select and copy it manually.");
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Study together, at your own pace</p>
        <h1 className="text-3xl font-bold tracking-tight">Friends</h1>
      </header>

      {overview.isError ? (
        <DatabaseErrorNotice
          title="Friends are not ready yet"
          error={overview.error}
          onRetry={() => {
            void overview.refetch();
          }}
        />
      ) : overview.isLoading || !overview.data ? (
        <div className="h-40 animate-pulse rounded-3xl bg-cell" />
      ) : (
        <>
          <div className="grid gap-4 xl:grid-cols-2">
            <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-surface to-surface p-5 shadow-sm">
              <div className="flex min-w-0 items-center gap-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Your Friend ID</p>
                  <p className="mt-1 font-mono text-xl font-bold tracking-[0.12em]">
                    {overview.data.profile.friend_code}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-2"
                  onClick={copyCode}
                >
                  <Copy /> Copy
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">Share this ID with people you know.</p>
            </section>

            <form
              onSubmit={addFriend}
              className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm"
            >
              <div className="mb-3 flex items-center gap-2">
                <UserPlus className="size-5 text-primary" />
                <h2 className="font-semibold">Add a friend</h2>
              </div>
              <div className="flex gap-2">
                <Input
                  aria-label="Friend ID"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  placeholder="6-digit friend ID"
                  value={friendCode}
                  onChange={(event) =>
                    setFriendCode(event.target.value.replace(/\D/g, "").slice(0, 6))
                  }
                />
                <Button type="submit" disabled={friendCode.length !== 6 || sendRequest.isPending}>
                  Send
                </Button>
              </div>
            </form>
          </div>

          <details className="rounded-3xl border border-primary/10 bg-surface shadow-sm">
            <summary className="cursor-pointer px-4 py-4 text-sm font-semibold">
              Sharing and privacy
              <span className="ml-2 font-normal text-muted-foreground">
                Choose what friends can see
              </span>
            </summary>
            <form onSubmit={saveProfile} className="space-y-3 border-t bg-background/30 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium">Display name</span>
                  <Input
                    maxLength={32}
                    required
                    value={displayName}
                    onChange={(event) => setDisplayName(event.target.value)}
                    placeholder="Name friends will see"
                  />
                </label>
                <Button type="submit" size="sm" disabled={saveSettings.isPending}>
                  Save
                </Button>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-2 border-t pt-3">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={shareProgress}
                    onChange={(event) => setShareProgress(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  <span>Share XP and habit progress</span>
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sharePresence}
                    onChange={(event) => setSharePresence(event.target.checked)}
                    className="size-4 accent-primary"
                  />
                  <span>Optionally share online status and focus</span>
                </label>
              </div>
              <p className="text-xs text-muted-foreground">
                Only accepted friends can see the information you choose to share.
              </p>
            </form>
          </details>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Incoming requests</h2>
              {overview.data.incoming.length === 0 ? (
                <p className="text-sm text-muted-foreground">No incoming requests.</p>
              ) : (
                <ul className="space-y-2">
                  {overview.data.incoming.map((request) => (
                    <li
                      key={request.request_id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-cell/70 p-3"
                    >
                      <div>
                        <p className="font-medium">{request.display_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          ID {request.friend_code}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          size="sm"
                          disabled={respondRequest.isPending || blockFriend.isPending}
                          onClick={() =>
                            respondRequest.mutate({ requestId: request.request_id, accept: true })
                          }
                        >
                          <Check /> Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={respondRequest.isPending || blockFriend.isPending}
                          aria-label={`Decline request from ${request.display_name}`}
                          onClick={() =>
                            respondRequest.mutate({ requestId: request.request_id, accept: false })
                          }
                        >
                          <X /> Decline
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blockFriend.isPending || respondRequest.isPending}
                          onClick={() => {
                            if (window.confirm(`Block ${request.display_name}?`)) {
                              blockFriend.mutate(request.friend_code);
                            }
                          }}
                        >
                          Block
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Pending requests</h2>
              {overview.data.outgoing.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No sent requests waiting for a response.
                </p>
              ) : (
                <ul className="space-y-2">
                  {overview.data.outgoing.map((request) => (
                    <li
                      key={request.friend_code}
                      className="flex items-center justify-between rounded-2xl bg-cell/70 p-3"
                    >
                      <span className="font-medium">{request.display_name}</span>
                      <span className="text-xs text-muted-foreground">Waiting for response</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">Blocked accounts</h2>
              {overview.data.blocked.length === 0 ? (
                <p className="text-sm text-muted-foreground">No blocked accounts.</p>
              ) : (
                <ul className="space-y-2">
                  {overview.data.blocked.map((blocked) => (
                    <li
                      key={blocked.friend_code}
                      className="flex items-center justify-between rounded-2xl bg-cell/70 p-3"
                    >
                      <div>
                        <p className="font-medium">{blocked.display_name}</p>
                        <p className="font-mono text-xs text-muted-foreground">
                          ID {blocked.friend_code}
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={unblockFriend.isPending}
                        onClick={() => unblockFriend.mutate(blocked.friend_code)}
                      >
                        Unblock
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <div className="grid items-start gap-4 2xl:grid-cols-2">
            <section className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm">
              <h2 className="mb-3 text-lg font-semibold">XP leaderboard</h2>
              {rankedFriends.length > 0 ? (
                <ol className="space-y-2">
                  {rankedFriends.map((friend, index) => {
                    const level = getLevelProgress(friend.total_xp ?? 0);
                    return (
                      <li
                        key={friend.friend_code}
                        className="flex items-center justify-between gap-3 rounded-2xl bg-cell/70 px-3 py-2"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <span className="w-6 shrink-0 text-center font-mono text-sm text-muted-foreground">
                            {index + 1}
                          </span>
                          <span className="truncate text-sm font-medium">
                            {friend.display_name}
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-mono text-sm font-semibold">
                            {(friend.total_xp ?? 0).toLocaleString()} XP
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            Level {level.level} · {level.name}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <p className="text-sm text-muted-foreground">
                  No friends are sharing XP progress yet.
                </p>
              )}
              {hiddenProgressFriends.length > 0 && (
                <p className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                  Progress hidden:{" "}
                  {hiddenProgressFriends.map((friend) => friend.display_name).join(", ")}
                </p>
              )}
            </section>

            <section className="rounded-3xl border border-primary/10 bg-surface p-5 shadow-sm">
              <div className="mb-3 flex items-center gap-2">
                <h2 className="text-lg font-semibold">Friends</h2>
                <span className="text-sm text-muted-foreground">
                  ({overview.data.friends.length})
                </span>
              </div>
              {overview.data.friends.length === 0 ? (
                <p className="rounded-3xl border border-dashed p-6 text-center text-sm text-muted-foreground">
                  No friends yet. Share your ID or add someone with theirs.
                </p>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {overview.data.friends.map((friend) => (
                    <FriendCard
                      key={friend.friend_code}
                      friend={friend}
                      removePending={removeFriend.isPending}
                      blockPending={blockFriend.isPending}
                      onRemove={() => {
                        if (window.confirm(`Remove ${friend.display_name} from your friends?`)) {
                          removeFriend.mutate(friend.friend_code);
                        }
                      }}
                      onBlock={() => {
                        if (
                          window.confirm(
                            `Block ${friend.display_name}? They will be removed as a friend.`,
                          )
                        ) {
                          blockFriend.mutate(friend.friend_code);
                        }
                      }}
                    />
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function FriendCard({
  friend,
  removePending,
  blockPending,
  onRemove,
  onBlock,
}: {
  friend: SocialOverview["friends"][number];
  removePending: boolean;
  blockPending: boolean;
  onRemove: () => void;
  onBlock: () => void;
}) {
  return (
    <li className="h-full rounded-3xl border border-border/70 bg-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">{friend.display_name}</p>
          <p className="font-mono text-xs text-muted-foreground">ID {friend.friend_code}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={removePending}
            onClick={onRemove}
          >
            Remove
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={blockPending}
            onClick={onBlock}
          >
            Block
          </Button>
        </div>
      </div>
    </li>
  );
}
