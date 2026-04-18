import {
  countRecentMemoryEpisodes,
  getRecentMemoryEpisodes,
  isDev,
  SUBJECT_NAME,
} from "@yuiju/utils";
import { type ActivityItem, mapEpisodeToActivityItem } from "./activity-view";

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 50;

const ACTIVITY_TYPES = [
  "behavior",
  "conversation",
  "plan_created",
  "plan_updated",
  "plan_completed",
  "plan_abandoned",
  "system",
] as const;

export interface QueryActivityEventsOptions {
  page?: number;
  pageSize?: number;
}

export interface ActivityPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface QueryActivityEventsResult {
  events: ActivityItem[];
  pagination: ActivityPagination;
}

export function normalizeActivityPage(page: number | undefined): number {
  if (!Number.isFinite(page)) return DEFAULT_PAGE;
  if (!page || page <= 0) return DEFAULT_PAGE;
  return Math.floor(page);
}

export function normalizeActivityPageSize(pageSize: number | undefined): number {
  if (!Number.isFinite(pageSize)) return DEFAULT_PAGE_SIZE;
  if (!pageSize || pageSize <= 0) return DEFAULT_PAGE_SIZE;
  if (pageSize > MAX_PAGE_SIZE) return MAX_PAGE_SIZE;
  return Math.floor(pageSize);
}

export async function queryActivityEvents(
  options?: QueryActivityEventsOptions,
): Promise<QueryActivityEventsResult> {
  const requestedPage = normalizeActivityPage(options?.page);
  const pageSize = normalizeActivityPageSize(options?.pageSize);

  try {
    const queryOptions = {
      types: [...ACTIVITY_TYPES],
      subject: SUBJECT_NAME,
      isDev: isDev(),
      sortField: "createdAt" as const,
    };

    const total = await countRecentMemoryEpisodes(queryOptions);
    const totalPages = total > 0 ? Math.ceil(total / pageSize) : 1;
    const page = Math.min(requestedPage, totalPages);
    const skip = (page - 1) * pageSize;

    const docs = await getRecentMemoryEpisodes({
      ...queryOptions,
      limit: pageSize,
      skip,
    });

    const events = docs.map((item) => mapEpisodeToActivityItem(item));

    return {
      events,
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        hasPrevPage: page > 1,
        hasNextPage: page < totalPages,
      },
    };
  } catch (error) {
    console.error("queryActivityEvents failed:", error);
    return {
      events: [],
      pagination: {
        page: requestedPage,
        pageSize,
        total: 0,
        totalPages: 1,
        hasPrevPage: false,
        hasNextPage: false,
      },
    };
  }
}
