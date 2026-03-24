import type {
  Application,
  Touchpoint,
  CustomProperty,
  CustomValue,
  CustomStage,
} from "@prisma/client";

export type ApplicationWithRelations = Application & {
  touchpoints: Touchpoint[];
  customValues: (CustomValue & {
    customProperty: CustomProperty;
  })[];
};

export type StageWithCount = CustomStage & {
  _count: { applications: number };
};

export interface DashboardFilters {
  search?: string;
  status?: string;
  platform?: string;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}

export interface GmailSyncResult {
  applicationsCreated: number;
  touchpointsAdded: number;
  emailsProcessed: number;
}

// NextAuth type augmentation
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
    };
  }
}
