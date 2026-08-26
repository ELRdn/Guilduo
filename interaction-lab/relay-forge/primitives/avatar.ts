/**
 * Actor identity — the avatar system shared by every Command surface.
 *
 * An avatar answers exactly one question: **who holds this work**. It never
 * carries state. A check, a warning or a file icon may sit beside or on top of
 * an avatar as a small state marker, but it must never stand in for the
 * identity itself (`design/ASSET_MANIFEST.md` and the brief's A1 rule):
 *
 *   avatar    = who
 *   marker    = what they are doing
 *   connector = how far the work has travelled
 *
 * Identity is resolved from the existing domain contract, not from anything
 * invented here:
 *
 *   1. `avatarUrl`        user-set image (social-store, PNG/JPEG/WebP data URL)
 *   2. provider preset    AgentRecord.provider, when a preset asset exists
 *   3. role crest         assets/avatar-role-{femme-}{role}.webp
 *   4. initials           two characters from the display name
 *   5. actor glyph        the section 13 geometry
 *
 * Every step degrades without moving layout: the element reserves its box
 * first, and an image that fails to load swaps to the next step in place.
 */

import { type Actor, actorTypeLabel } from "../model.ts";
import { actorNode, type ActorNodeState } from "./actor.ts";
import { el } from "./dom.ts";

/** Surface sizes from the brief's A1 table, expressed as named steps. */
export type AvatarSize = "row" | "shelf" | "lens" | "relay" | "profile";

/** Role crests that exist as assets. Anything else falls through to initials. */
const ROLE_CRESTS: ReadonlySet<string> = new Set([
  "sentinel",
  "archivist",
  "operator",
  "alchemist",
  "ranger",
  "artificer",
]);

/**
 * Providers with a bundled preset image. None ship in this repository today, so
 * Agent identities resolve at step 3 or later. The map is the extension point:
 * adding a real asset here is the only change needed to enable step 2.
 */
const PROVIDER_PRESETS: Readonly<Record<string, string>> = {};

function roleCrestUrl(actor: Actor): string | null {
  if (actor.avatarRole === undefined || !ROLE_CRESTS.has(actor.avatarRole)) return null;
  const variant = actor.avatarVariant === "femme" ? "femme-" : "";
  // Relative to /interaction-lab/relay-forge/, the repository assets sit two up.
  return `../../assets/avatar-role-${variant}${actor.avatarRole}.webp`;
}

function resolveImage(actor: Actor): { readonly src: string; readonly step: string } | null {
  if (actor.avatarUrl !== undefined && actor.avatarUrl !== "") {
    return { src: actor.avatarUrl, step: "user" };
  }
  if (actor.provider !== undefined) {
    const preset = PROVIDER_PRESETS[actor.provider];
    if (preset !== undefined) return { src: preset, step: "provider" };
  }
  const crest = roleCrestUrl(actor);
  return crest === null ? null : { src: crest, step: "crest" };
}

export interface ActorAvatarOptions {
  readonly size?: AvatarSize;
  /** State marker drawn as a small badge on the avatar corner. */
  readonly state?: ActorNodeState;
  /** Set false where a neighbouring element already carries the state. */
  readonly showMarker?: boolean;
}

/**
 * Renders one actor avatar. The accessible name always includes the actor type
 * so Human, Agent, System and Companion stay distinguishable when the image is
 * the only visual difference.
 */
export function actorAvatar(actor: Actor, options: ActorAvatarOptions = {}): HTMLElement {
  const size = options.size ?? "row";
  const state = options.state ?? "idle";
  const showMarker = options.showMarker ?? state !== "idle";
  const image = resolveImage(actor);

  // Step 4/5 live in the DOM from the start so a failed image swaps in place.
  const fallback = el(
    "span",
    { class: "rf-avatar-fallback", "aria-hidden": "true" },
    actor.initials === "" ? actorNode(actor, { state: "idle" }) : actor.initials,
  );

  const frame = el(
    "span",
    {
      class: "rf-avatar-frame",
      "data-actor-kind": actor.kind,
      "data-resolved": image === null ? "initials" : image.step,
    },
    fallback,
  );

  if (image !== null) {
    const picture = el("img", {
      class: "rf-avatar-image",
      src: image.src,
      alt: "",
      loading: "lazy",
      decoding: "async",
    });
    // A missing or deleted image degrades to initials without layout shift.
    picture.addEventListener("error", () => {
      picture.remove();
      frame.setAttribute("data-resolved", "initials");
    });
    frame.appendChild(picture);
  }

  return el(
    "span",
    {
      class: "rf-avatar",
      "data-size": size,
      "data-actor-kind": actor.kind,
      "data-state": state,
      title: `${actor.name} · ${actorTypeLabel(actor.kind)}`,
    },
    frame,
    showMarker
      ? el("span", { class: "rf-avatar-marker", "data-state": state, "aria-hidden": "true" })
      : null,
    el("span", { class: "rf-visually-hidden" }, `${actor.name}, ${actorTypeLabel(actor.kind)}`),
  );
}

/**
 * Avatar plus name and actor-type label. The manifest requires the type to be
 * written out wherever an identity image appears, so this is the default form
 * anywhere an avatar is not immediately adjacent to its own label.
 */
export function actorIdentityBlock(
  actor: Actor,
  options: ActorAvatarOptions & { readonly secondary?: string } = {},
): HTMLElement {
  return el(
    "span",
    { class: "rf-identity-block" },
    actorAvatar(actor, options),
    el(
      "span",
      { class: "rf-identity-copy" },
      el("span", { class: "rf-identity-name" }, actor.name),
      el(
        "span",
        { class: "rf-identity-meta" },
        el("span", { class: "rf-identity-type" }, actorTypeLabel(actor.kind)),
        options.secondary === undefined ? null : el("span", { class: "rf-identity-secondary" }, options.secondary),
      ),
    ),
  );
}
