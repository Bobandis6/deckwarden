"use client";

/**
 * Change picture (X5, WAVE3.md D5) — the picture on /account as a button,
 * and the dialog it opens: the provider picture, a Magic card's art, or the
 * initial.
 *
 * The button is the picture itself with D0's one unlabelled icon, the
 * `Pencil` badge — `aria-label="Change picture"`, shown on hover and on
 * focus and always on a coarse pointer; the 48 px picture is the target
 * (≥ 44 px). The dialog is ui/modal.tsx: focus trap, Esc, focus back on the
 * picture. The three choices are native radios in a labelled group (the
 * share dialog's pattern — there is no radio primitive). The card box is
 * X2's NameSuggest in pick mode, Magic cards only, no apology copy.
 *
 * Wherever the saved art's crop shows in the dialog, its credit line sits
 * beside it; a newly picked card previews as its full card image, which
 * carries its own artist line in the frame.
 *
 * The first choice is named for the provider when one is linked ("Discord
 * picture"); with both linked it is "Your sign-in picture" — a sign-in
 * refreshes the picture of whichever provider signed in last. "Refresh now"
 * is that sign-in round trip itself (LATER row 121: no token route opens).
 *
 * Save → PUT /api/profile/avatar. On success the session is refetched with
 * the cookie cache bypassed (the header changes at once — the refetch
 * re-issues the cache cookie, sign-in-refresh.test.ts (e)), then the page
 * refreshes. A refusal keeps the dialog open with the route's sentence; the
 * current picture is untouched.
 */
import { PencilIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { CardImage } from "@/components/cards/card-image";
import { UserAvatar } from "@/components/profile/user-avatar";
import { NameSuggest } from "@/components/search/name-suggest";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { authClient } from "@/lib/auth-client";
import {
  avatarCredit,
  avatarInitial,
  type AvatarChoice,
  type AvatarRequest,
} from "@/lib/profile/avatar";
import type { SuggestRow } from "@/lib/search/suggest";

export type SignInProvider = "discord" | "google";

const PROVIDER_LABEL: Record<SignInProvider, string> = { discord: "Discord", google: "Google" };

type Kind = AvatarRequest["kind"];

/** The first choice's name: the one linked provider, or provider-neutral words. */
export function providerPictureLabel(providers: readonly SignInProvider[]): string {
  return providers.length === 1
    ? `${PROVIDER_LABEL[providers[0]]} picture`
    : "Your sign-in picture";
}

export function ChangePicture({
  name,
  image,
  avatar,
  providers,
}: {
  name: string;
  image: string | null;
  avatar: AvatarChoice | null;
  providers: readonly SignInProvider[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label="Change picture"
        onClick={() => setOpen(true)}
        className="group focus-visible:ring-ring/50 relative shrink-0 rounded-full outline-none focus-visible:ring-2"
      >
        <UserAvatar name={name} image={image} avatar={avatar} size={48} />
        <span
          aria-hidden
          data-slot="pencil"
          className="bg-background text-foreground absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full border opacity-0 shadow-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 pointer-coarse:opacity-100 motion-reduce:transition-none"
        >
          <PencilIcon className="size-3.5" />
        </span>
      </button>
      {open && (
        <ChangePictureDialog
          name={name}
          image={image}
          avatar={avatar}
          providers={providers}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

function ChangePictureDialog({
  name,
  image,
  avatar,
  providers,
  onClose,
}: {
  name: string;
  image: string | null;
  avatar: AvatarChoice | null;
  providers: readonly SignInProvider[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { refetch } = authClient.useSession();
  const current: Kind = avatar === null ? "provider" : avatar.kind;
  const [kind, setKind] = useState<Kind>(current);
  const [card, setCard] = useState<SuggestRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Nothing to send: the same choice, or card art with no new card picked.
  const unchanged = kind === "art" ? card === null : kind === current;
  const canSave = !busy && !(kind === "art" && card === null && current !== "art");

  const save = async () => {
    if (!canSave) return;
    if (unchanged) return onClose();
    let body: AvatarRequest;
    if (kind === "art") {
      if (!card) return onClose();
      body = { kind: "art", cardId: card.id };
    } else {
      body = { kind };
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: { error?: string } = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Couldn't save your picture. Try again.");
        setBusy(false);
        return;
      }
      // The header reads the session: bypass the 5-minute cookie cache once.
      await refetch({ query: { disableCookieCache: true } });
      router.refresh();
      onClose();
    } catch {
      setError("Couldn't save — check your connection and try again.");
      setBusy(false);
    }
  };

  const refreshFrom = async (provider: SignInProvider) => {
    setBusy(true);
    setError(null);
    const { error } = await authClient.signIn.social({ provider, callbackURL: "/account" });
    // On success the browser leaves for the provider; reaching here means it didn't.
    if (error) {
      setError(error.message ?? "Sign-in failed — try again.");
      setBusy(false);
    }
  };

  const optionClass =
    "has-checked:bg-muted/60 hover:bg-muted/40 flex cursor-pointer items-center gap-3 rounded-md px-2 py-2";

  return (
    <Modal
      label="Change picture"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        className="space-y-3"
      >
        <fieldset disabled={busy} className="space-y-1.5">
          <legend className="sr-only">Your picture</legend>

          <div className={optionClass}>
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="picture"
                value="provider"
                checked={kind === "provider"}
                onChange={() => setKind("provider")}
              />
              <UserAvatar name={name} image={image} size={48} />
              <span className="min-w-0">
                <span className="block text-sm font-medium">{providerPictureLabel(providers)}</span>
                <span className="text-muted-foreground block text-xs">
                  Updates each time you sign in.
                </span>
              </span>
            </label>
            <span className="flex shrink-0 flex-col gap-1">
              {providers.map((provider) => (
                <Button
                  key={provider}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void refreshFrom(provider)}
                >
                  {providers.length === 1
                    ? "Refresh now"
                    : `Refresh from ${PROVIDER_LABEL[provider]}`}
                </Button>
              ))}
            </span>
          </div>

          <div className={optionClass}>
            <label className="flex shrink-0 cursor-pointer items-center gap-3">
              <input
                type="radio"
                name="picture"
                value="art"
                checked={kind === "art"}
                onChange={() => setKind("art")}
              />
              <ArtPreview card={card} avatar={avatar} name={name} />
              <span className="sr-only">Card art</span>
            </label>
            <span
              className="min-w-0 flex-1 space-y-1"
              onKeyDown={(e) => {
                // D0: Enter with no row highlighted does what the box did
                // before — here, nothing. Base UI prevents the default when
                // Enter picks a row; any other Enter would press Save.
                if (e.key === "Enter" && !e.defaultPrevented) e.preventDefault();
              }}
            >
              <span aria-hidden className="block text-sm font-medium">
                Card art
              </span>
              <NameSuggest
                game="mtg"
                scope="cards"
                detail="type"
                type="text"
                placeholder="Search a Magic card…"
                aria-label="Search a Magic card"
                onValueChange={() => setKind("art")}
                onPick={(row) => {
                  setCard(row);
                  setKind("art");
                }}
              />
              {card ? (
                <span className="text-muted-foreground block truncate text-xs">{card.name}</span>
              ) : (
                // The saved art's crop is on screen: its credit sits beside
                // it, whole — never truncated, so the © is always visible.
                avatar?.kind === "art" && (
                  <span className="text-muted-foreground block text-xs">
                    {avatarCredit(avatar)}
                  </span>
                )
              )}
            </span>
          </div>

          <label className={optionClass}>
            <input
              type="radio"
              name="picture"
              value="initial"
              checked={kind === "initial"}
              onChange={() => setKind("initial")}
            />
            <UserAvatar name={name} avatar={{ kind: "initial" }} size={48} />
            <span className="text-sm font-medium">Just my initial</span>
          </label>
        </fieldset>

        {error && (
          <p role="alert" className="text-destructive text-xs">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={!canSave}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/**
 * The card-art choice's picture: a newly picked card shows its card image
 * (the full card carries its own artist line); the saved art shows its crop
 * through UserAvatar; nothing chosen yet is the initial, muted.
 */
function ArtPreview({
  card,
  avatar,
  name,
}: {
  card: SuggestRow | null;
  avatar: AvatarChoice | null;
  name: string;
}) {
  if (card?.image) {
    return (
      <span aria-hidden className="flex size-12 shrink-0 items-center justify-center">
        <CardImage src={card.image} alt="" width={146} height={204} className="h-12 w-auto" />
      </span>
    );
  }
  if (avatar?.kind === "art") return <UserAvatar name={name} avatar={avatar} size={48} />;
  return (
    <span
      aria-hidden
      className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-full text-lg"
    >
      {avatarInitial(name)}
    </span>
  );
}
