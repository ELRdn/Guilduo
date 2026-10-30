import type { QuestImage } from "./questforge.ts";

export interface ImageUploadTicket { imageId: string; uploadPath: string; uploadToken: string; expiresAt: string }
export interface QuestImagePort {
  list(questId: string): Promise<{ images: QuestImage[]; usedBytes: number; quotaBytes: number }>;
  prepare(questId: string, file: File, context: QuestImage["context"], reviewQuestId: string, uploadId: string): Promise<ImageUploadTicket>;
  upload(ticket: ImageUploadTicket, file: File): Promise<QuestImage>;
  read(imageId: string, original?: boolean): Promise<Blob>;
  remove(imageId: string): Promise<void>;
}
