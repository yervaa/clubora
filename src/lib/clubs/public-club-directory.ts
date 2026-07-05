import "server-only";

import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";

const SEARCH_MAX_CHARS = 80;

type DirectoryClubRow = {
  id: string;
  name: string;
  description: string | null;
  category?: string | null;
};

export type PublicDirectoryClub = {
  id: string;
  name: string;
  description: string;
  category: string | null;
};

export type PublicClubDirectoryPayload = {
  clubs: PublicDirectoryClub[];
  supportsCategory: boolean;
  categoryOptions: string[];
};

export function normalizeDirectorySearchQuery(raw: string): string {
  return raw
    .replace(/[%_,'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, SEARCH_MAX_CHARS);
}

export function normalizeDirectoryCategory(raw: string): string {
  return raw
    .replace(/[%_,'"\\]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 50);
}

function mapPublicDirectoryRows(rows: DirectoryClubRow[]): PublicDirectoryClub[] {
  return rows
    .map(
      (row) =>
        ({
          id: row.id,
          name: String(row.name ?? "").trim() || "Club",
          description: typeof row.description === "string" ? row.description : "",
          category: typeof row.category === "string" && row.category.trim() ? row.category.trim() : null,
        }) satisfies PublicDirectoryClub,
    )
    .sort((a, b) => a.name.localeCompare(b.name));
}

export const getPublicClubDirectory = cache(
  async (rawQuery: string, rawCategory: string): Promise<PublicClubDirectoryPayload> => {
    const admin = createAdminClient();
    const query = normalizeDirectorySearchQuery(rawQuery);
    const requestedCategory = normalizeDirectoryCategory(rawCategory);

    const withCategorySelect = "id, name, description, category";
    const fallbackSelect = "id, name, description";

    let withCategoryBuilder = admin
      .from("clubs")
      .select(withCategorySelect)
      .eq("status", "active")
      .eq("is_listed", true)
      .limit(160);
    let fallbackBuilder = admin
      .from("clubs")
      .select(fallbackSelect)
      .eq("status", "active")
      .eq("is_listed", true)
      .limit(160);

    if (query) {
      withCategoryBuilder = withCategoryBuilder.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
      fallbackBuilder = fallbackBuilder.or(`name.ilike.%${query}%,description.ilike.%${query}%`);
    }
    if (requestedCategory) {
      withCategoryBuilder = withCategoryBuilder.ilike("category", requestedCategory);
    }

    const { data: withCategoryRows, error: withCategoryError } = await withCategoryBuilder;

    let supportsCategory = !withCategoryError;
    let baseRows: DirectoryClubRow[] = [];
    let categoryOptions: string[] = [];

    if (supportsCategory && withCategoryRows) {
      baseRows = withCategoryRows as DirectoryClubRow[];

      const { data: categoryRows } = await admin
        .from("clubs")
        .select("category")
        .eq("status", "active")
        .eq("is_listed", true)
        .not("category", "is", null)
        .limit(300);

      const categoryMap = new Map<string, string>();
      for (const categoryRow of (categoryRows as { category: string | null }[] | null) ?? []) {
        const label = typeof categoryRow.category === "string" ? categoryRow.category.trim() : "";
        if (!label) continue;
        const key = label.toLocaleLowerCase();
        if (!categoryMap.has(key)) {
          categoryMap.set(key, label);
        }
      }
      categoryOptions = Array.from(categoryMap.values()).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
    } else {
      const { data: fallbackRows } = await fallbackBuilder;
      supportsCategory = false;
      baseRows = (fallbackRows as DirectoryClubRow[] | null) ?? [];
      categoryOptions = [];
    }

    return {
      clubs: mapPublicDirectoryRows(baseRows),
      supportsCategory,
      categoryOptions,
    };
  },
);

