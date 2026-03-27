export interface DiaryItem {
  id: string;
  subject: string;
  diaryDate: string;
  displayDate: string;
  text: string;
  generatedAt: string;
  updatedAt: string;
  displayUpdatedAt: string;
}

export interface DiaryPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasPrevPage: boolean;
  hasNextPage: boolean;
}

export interface DiaryResponsePayload {
  data?: {
    items?: DiaryItem[];
    pagination?: DiaryPagination;
    filters?: {
      startDate?: string;
      endDate?: string;
    };
  };
}
