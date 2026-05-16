export const PERSON_MEMORY_SECTION_KEYS = [
  "称呼",
  "喜好",
  "雷区",
  "最近在忙什么",
  "悠酱对她的态度",
  "最近一次值得记住的互动",
  "其他补充",
] as const;

export const EMPTY_PERSON_MEMORY_SECTION = "（暂无）";

export type PersonMemorySectionKey = (typeof PERSON_MEMORY_SECTION_KEYS)[number];

export interface PersonMemoryDocument {
  nickname: string;
  lastUpdatedAt: string;
  sections: Record<PersonMemorySectionKey, string>;
}

export interface PersonMemoryUpdateInput {
  nickname: string;
  interactionMaterial: string;
  scene: "private" | "group";
  interactionCount: number;
}

export interface PersonMemoryUpdateResult {
  status: "skipped" | "created" | "updated" | "review_rejected" | "malformed_existing_file";
}

export interface PersonMemoryDirectoryResult {
  items: string[];
  page_number: number;
  total: number;
  hasMore: boolean;
}

export interface PersonMemoryContentResult {
  nickname: string;
  sections: Record<PersonMemorySectionKey, string>;
}

export interface PersonMemoryProposalChange {
  section: PersonMemorySectionKey;
  content: string;
  reason: string;
}

export interface PersonMemoryProposal {
  shouldUpdate: boolean;
  changes: PersonMemoryProposalChange[];
}
