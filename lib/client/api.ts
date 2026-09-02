import { ExpenseWithRelations } from '@/repositories/expense.repository';

export interface ApiResponse<T> {
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface UserProfile {
  id: string;
  name: string;
  phoneNumber: string;
  role: string;
  isActive: boolean;
}

export interface DashboardStatsData {
  kpi: {
    monthTotal: number;
    monthCount: number;
    todayTotal: number;
    todayCount: number;
    needsReviewCount: number;
    autoRate: number;
  };
  categories: Array<{
    id: string;
    name: string;
    amount: number;
    count: number;
    percentage: number;
  }>;
  dailyTrend: Array<{
    date: string;
    label: string;
    amount: number;
    count: number;
  }>;
  needsReviewItems: ExpenseWithRelations[];
  recentExpenses: ExpenseWithRelations[];
}

export interface CategoryItem {
  id: string;
  name: string;
  keywords?: string[];
  isActive?: boolean;
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
  try {
    const res = await fetch(endpoint, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    const json = await res.json();
    return json as ApiResponse<T>;
  } catch (error) {
    return {
      data: null,
      error: {
        code: 'NETWORK_ERROR',
        message: error instanceof Error ? error.message : 'Network request failed',
      },
    };
  }
}

export const apiClient = {
  getMe: () => request<UserProfile>('/api/auth/me'),
  logout: () => request<{ message: string }>('/api/auth/logout', { method: 'POST' }),
  createSession: (phoneNumber: string) =>
    request<{ token: string; staff: UserProfile }>('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ phoneNumber }),
    }),
  getDashboardStats: () => request<DashboardStatsData>('/api/dashboard/stats'),
  getExpenses: (params: Record<string, string | number | undefined>) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, val]) => {
      if (val !== undefined && val !== '') query.append(key, String(val));
    });
    return request<ExpenseWithRelations[]>(`/api/expenses?${query.toString()}`);
  },
  getExpenseById: (id: string) => request<ExpenseWithRelations>(`/api/expenses/${id}`),
  updateExpense: (id: string, data: Record<string, unknown>) =>
    request<ExpenseWithRelations>(`/api/expenses/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),
  getCategories: () => request<CategoryItem[]>('/api/categories'),
};
