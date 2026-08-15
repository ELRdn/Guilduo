const test = require("node:test");
const assert = require("node:assert/strict");
import type { WorkerEnv } from "../worker/src/worker-types.ts";
import type { OwnProfile, Party } from "../worker/src/social-store.ts";
import { hasErrorCode, required } from "./test-helpers.ts";

type SocialStore = typeof import("../worker/src/social-store.ts");

let social: SocialStore;

test.before(async () => {
  social = await import("../worker/src/social-store.ts");
});

test.beforeEach(() => social?.resetSocialMemoryForTests());

async function profile(env: WorkerEnv, uid: string, handle = uid): Promise<OwnProfile> {
  return required(await social.upsertProfile(env, uid, {
    displayName: `User ${uid}`,
    handle,
    bio: `Bio ${uid}`,
    avatarRole: "sentinel",
    avatarVariant: "femme",
    level: 3,
  }));
}

async function expectCode(promise: Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(promise, (error: unknown) => hasErrorCode(error, code));
}

test("handles normalize, validate, reject reserved values, and stay isolated by env", async () => {
  assert.equal(social.normalizeHandle("  @MiXeD_Name "), "mixed_name");
  assert.equal(social.validateHandle("@valid_01"), "valid_01");
  assert.equal(social.isReservedHandle("@QuestForge"), true);
  assert.throws(() => social.validateHandle("ab"), (error: unknown) => hasErrorCode(error, "handle_invalid"));
  assert.throws(() => social.validateHandle("admin"), (error: unknown) => hasErrorCode(error, "handle_reserved"));

  const envA: WorkerEnv = {};
  const envB: WorkerEnv = {};
  await profile(envA, "user-a", "same_handle");
  assert.equal(await social.findProfileByHandle(envB, "same_handle"), null);
});

test("profiles enforce uniqueness and expose only approved public fields", async () => {
  const env: WorkerEnv = {};
  const own = await profile(env, "alpha", "Alpha_User");
  await expectCode(profile(env, "beta", "alpha_user"), "handle_taken");
  const found = required(await social.findProfileByHandle(env, "@ALPHA_USER"));
  assert.deepEqual(Object.keys(found).sort(), ["avatarRole", "avatarVariant", "avatarUrl", "bio", "displayName", "handle", "level", "uid"].sort());
  assert.equal(found.handle, "@alpha_user");
  assert.equal("email" in found, false);
  assert.equal("createdAt" in found, false);
  assert.equal(found.avatarUrl, "");
  assert.equal(typeof own.handleChangedAt, "string");
});

test("profiles accept a bounded image data URL and reject unsafe avatar values", async () => {
  const env: WorkerEnv = {};
  const avatarUrl = "data:image/webp;base64," + "A".repeat(128);
  const saved = required(await social.upsertProfile(env, "avatar-user", { displayName: "Avatar User", handle: "avatar_user", avatarUrl }));
  assert.equal(saved.avatarUrl, avatarUrl);
  await expectCode(social.upsertProfile(env, "avatar-user", { avatarUrl: "https://example.com/avatar.png" }), "avatar_url_invalid");
  await expectCode(social.upsertProfile(env, "avatar-user", { avatarUrl: "data:image/png;base64," + "A".repeat(700001) }), "avatar_url_too_large");
});

test("handle changes have a 30 day cooldown", async () => {
  const env: WorkerEnv = { SOCIAL_NOW: "2026-01-01T00:00:00.000Z" };
  await profile(env, "alpha", "alpha_one");
  env.SOCIAL_NOW = "2026-01-15T00:00:00.000Z";
  await expectCode(social.upsertProfile(env, "alpha", { handle: "alpha_two" }), "handle_cooldown");
  env.SOCIAL_NOW = "2026-02-01T00:00:00.000Z";
  const changed = required(await social.upsertProfile(env, "alpha", { handle: "alpha_two" }));
  assert.equal(changed.handle, "@alpha_two");
});

test("friend requests reject self, duplicates, reverse-pending, and missing profiles", async () => {
  const env: WorkerEnv = {};
  await profile(env, "alpha", "alpha_user");
  await profile(env, "beta", "beta_user");
  await expectCode(social.sendFriendRequest(env, "alpha", "alpha"), "friend_self");
  await expectCode(social.sendFriendRequest(env, "alpha", "missing"), "profile_not_found");
  await social.sendFriendRequest(env, "alpha", "beta");
  await expectCode(social.sendFriendRequest(env, "alpha", "beta"), "friend_request_pending");
  await expectCode(social.sendFriendRequest(env, "beta", "alpha"), "friend_request_pending");
});

test("only the receiver can accept, then either user can remove the friendship", async () => {
  const env: WorkerEnv = {};
  await profile(env, "alpha", "alpha_user");
  await profile(env, "beta", "beta_user");
  const request = await social.sendFriendRequest(env, "alpha", "beta");
  await expectCode(social.acceptFriendRequest(env, "alpha", request.id), "friend_request_forbidden");
  const friends = await social.acceptFriendRequest(env, "beta", request.id);
  assert.equal(friends.length, 1);
  assert.equal(friends[0].uid, "alpha");
  await expectCode(social.sendFriendRequest(env, "alpha", "beta"), "already_friends");
  assert.deepEqual(await social.removeFriend(env, "alpha", "beta"), { removed: true, friendUid: "beta" });
  assert.equal((await social.listFriends(env, "beta")).length, 0);
});

test("the receiver can decline without creating a friendship", async () => {
  const env: WorkerEnv = {};
  await profile(env, "alpha", "alpha_user");
  await profile(env, "beta", "beta_user");
  const request = await social.sendFriendRequest(env, "alpha", "beta");
  const pending = await social.declineFriendRequest(env, "beta", request.id);
  assert.equal(pending.length, 0);
  assert.equal((await social.listFriends(env, "alpha")).length, 0);
});

test("party invites persist only a hash and can be accepted once", async () => {
  const env: WorkerEnv = {};
  await profile(env, "owner", "owner_user");
  await profile(env, "member", "member_user");
  await social.createParty(env, "owner", { name: "Focus Party" });
  const issued = await social.inviteToParty(env, "owner", { inviteeUid: "member" });
  assert.match(issued.token, /^party_invite_/);
  assert.equal("tokenHash" in issued.invite, false);
  assert.equal(JSON.stringify(issued.invite).includes(issued.token), false);
  const party = required(await social.acceptPartyInvite(env, "member", { token: issued.token }));
  assert.equal(party.members.length, 2);
  await expectCode(social.acceptPartyInvite(env, "member", { token: issued.token }), "party_membership_exists");
});

test("a user can belong to one party and only owners can manage members", async () => {
  const env: WorkerEnv = {};
  await profile(env, "owner", "owner_user");
  await profile(env, "member", "member_user");
  await social.createParty(env, "owner", { name: "One Party" });
  const invite = await social.inviteToParty(env, "owner", { inviteeUid: "member" });
  await social.acceptPartyInvite(env, "member", { inviteId: invite.invite.id });
  await expectCode(social.createParty(env, "member", { name: "Second Party" }), "party_membership_exists");
  await expectCode(social.removePartyMember(env, "member", "owner"), "party_owner_required");
  await expectCode(social.removePartyMember(env, "owner", "owner"), "party_owner_remove_self");
  const party = required(await social.removePartyMember(env, "owner", "member"));
  assert.equal(party.members.length, 1);
});

test("parties cap membership at four", async () => {
  const env: WorkerEnv = {};
  await profile(env, "owner", "owner_user");
  await social.createParty(env, "owner", { name: "Four Only" });
  for (const id of ["member1", "member2", "member3", "member4"]) await profile(env, id, id);
  for (const id of ["member1", "member2", "member3"]) {
    const invite = await social.inviteToParty(env, "owner", { inviteeUid: id });
    await social.acceptPartyInvite(env, id, { token: invite.token });
  }
  assert.equal(required(await social.getParty(env, "owner")).members.length, 4);
  await expectCode(social.inviteToParty(env, "owner", { inviteeUid: "member4" }), "party_full");
});

test("owner departure transfers ownership to the earliest joined member", async () => {
  const env: WorkerEnv = { SOCIAL_NOW: "2026-03-01T00:00:00.000Z" };
  for (const id of ["owner", "first", "second"]) await profile(env, id, `${id}_user`);
  await social.createParty(env, "owner", { name: "Transfer" });
  env.SOCIAL_NOW = "2026-03-02T00:00:00.000Z";
  let invite = await social.inviteToParty(env, "owner", { inviteeUid: "first" });
  await social.acceptPartyInvite(env, "first", { token: invite.token });
  env.SOCIAL_NOW = "2026-03-03T00:00:00.000Z";
  invite = await social.inviteToParty(env, "owner", { inviteeUid: "second" });
  await social.acceptPartyInvite(env, "second", { token: invite.token });
  const result = await social.leaveParty(env, "owner");
  assert.equal(result.nextOwnerUid, "first");
  const party = required(await social.getParty(env, "second"));
  assert.equal(party.ownerUid, "first");
  assert.equal(party.members.find((member) => member.uid === "first")?.role, "owner");
});

test("party invites expire after seven days", async () => {
  const env: WorkerEnv = { SOCIAL_NOW: "2026-04-01T00:00:00.000Z" };
  await profile(env, "owner", "owner_user");
  await profile(env, "member", "member_user");
  await social.createParty(env, "owner", { name: "Expiry" });
  const invite = await social.inviteToParty(env, "owner", { inviteeUid: "member" });
  env.SOCIAL_NOW = "2026-04-09T00:00:00.000Z";
  await expectCode(social.acceptPartyInvite(env, "member", { token: invite.token }), "party_invite_expired");
  assert.equal(await social.getParty(env, "member"), null);
});

test("an empty owner party is removed when the owner leaves", async () => {
  const env: WorkerEnv = {};
  await profile(env, "owner", "owner_user");
  const party = required(await social.createParty(env, "owner", { name: "Solo" }));
  const result = await social.leaveParty(env, "owner");
  assert.equal(result.partyId, party.id);
  assert.equal(await social.getParty(env, "owner"), null);
});
