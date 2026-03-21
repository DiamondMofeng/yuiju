import type { ActivityItem } from "@/lib/activity/activity-view";

export type {
  ActivityDetailField,
  ActivityItem,
  ActivityTrigger,
} from "@/lib/activity/activity-view";

export interface ActivityResponsePayload {
  data?: {
    count?: number;
    events?: ActivityItem[];
  };
}
