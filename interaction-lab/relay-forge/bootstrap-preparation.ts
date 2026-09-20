import { QuestForgeRepository } from "../repository.ts";

type TokenProvider = QuestForgeRepository["getToken"];
export type PreparedWorkspace = {
  repository: QuestForgeRepository;
  snapshot: ReturnType<QuestForgeRepository["loadSnapshot"]>;
};

export function prepareWorkspaceReads(
  verifiedToken: TokenProvider,
  createRepository: (token: TokenProvider) => QuestForgeRepository = getToken => new QuestForgeRepository({ getToken }),
) {
  let closed = false;
  let prepared: (PreparedWorkspace & { subject: string }) | undefined;
  return {
    onSessionToken(token: string, subject: string): void {
      if (closed || prepared || !subject || !token) return;
      // Only loadSnapshot GETs run here. Do not hand this repository to the UI
      // until finish() binds it to the normal verified-account token provider.
      const repository = createRepository(async force => force ? "" : token);
      const snapshot = repository.loadSnapshot({ deferPanels: true });
      void snapshot.catch(() => {}); // Auth can fail before this read settles.
      prepared = { repository, snapshot, subject };
    },
    finish(verifiedUid?: string): PreparedWorkspace | undefined {
      closed = true;
      const candidate = prepared;
      prepared = undefined;
      if (!verifiedUid || candidate?.subject !== verifiedUid) return undefined;
      candidate.repository.getToken = verifiedToken;
      return candidate;
    },
  };
}
