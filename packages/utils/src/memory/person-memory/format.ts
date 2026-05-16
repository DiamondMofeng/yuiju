import {
  EMPTY_PERSON_MEMORY_SECTION,
  PERSON_MEMORY_SECTION_KEYS,
  type PersonMemorySectionKey,
} from "./types";

const listItemPattern = /^\s*(?:[-*]|\d+\.)\s+/;
const tableRowPattern = /^\s*\|/;
const nestedHeadingPattern = /^\s*#{1,6}\s+/;

export class PersonMemoryFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PersonMemoryFormatError";
  }
}

export function normalizeSectionContent(content: string): string {
  const trimmed = content.replaceAll("\r\n", "\n").trim();
  return trimmed || EMPTY_PERSON_MEMORY_SECTION;
}

export function assertValidSectionContent(section: PersonMemorySectionKey, content: string) {
  if (!content.trim()) {
    throw new PersonMemoryFormatError(`人物记忆字段「${section}」内容不能为空。`);
  }

  for (const line of content.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine) {
      continue;
    }

    if (nestedHeadingPattern.test(trimmedLine)) {
      throw new PersonMemoryFormatError(`人物记忆字段「${section}」内容不能包含额外标题。`);
    }

    if (listItemPattern.test(trimmedLine)) {
      throw new PersonMemoryFormatError(`人物记忆字段「${section}」内容不能使用列表格式。`);
    }

    if (tableRowPattern.test(trimmedLine)) {
      throw new PersonMemoryFormatError(`人物记忆字段「${section}」内容不能使用表格格式。`);
    }
  }
}

export function isPersonMemorySectionKey(value: string): value is PersonMemorySectionKey {
  return PERSON_MEMORY_SECTION_KEYS.includes(value as PersonMemorySectionKey);
}
