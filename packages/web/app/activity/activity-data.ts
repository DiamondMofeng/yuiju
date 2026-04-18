import type { ActivityItem } from "@/lib/activity/activity-view";

export type {
  ActivityDetailField,
  ActivityItem,
  ActivityTrigger,
} from "@/lib/activity/activity-view";

export interface ActivityPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface ActivityResponsePayload {
  data?: {
    events?: ActivityItem[];
    pagination?: ActivityPagination;
  };
}
