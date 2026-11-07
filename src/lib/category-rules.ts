// Pure rules for the catalog tree, shared by the server functions and the client.

export const normGrade = (g: string | null | undefined) =>
  (g ?? "").trim().toUpperCase().replace(/\s+/g, "");

// Rate group of a product: "<category>:<grade>" when the grade is one of the category's grades, else the category.
export function groupIdFrom(category: string, grade: string | null, grades: string[]): string {
  const g = normGrade(grade);
  return g && grades.includes(g) ? `${category}:${g}` : category;
}

// Every rate row a subcategory needs: one per profile x preset x grade (or one group when ungraded).
export function rateRowsFor(
  categoryId: string,
  grades: string[],
  profiles: string[],
  presets: string[],
): { profile_id: string; preset_id: string; group_id: string }[] {
  const groups = grades.length ? grades.map((g) => `${categoryId}:${g}`) : [categoryId];
  return profiles.flatMap((profile_id) =>
    presets.flatMap((preset_id) => groups.map((group_id) => ({ profile_id, preset_id, group_id }))),
  );
}

// Grades being removed that products still use (removal must be refused for these).
export function removedGradesInUse(
  oldGrades: string[],
  newGrades: string[],
  used: { grade: string | null }[],
): string[] {
  const inUse = new Set(used.map((u) => normGrade(u.grade)));
  return oldGrades.filter((g) => !newGrades.includes(g) && inUse.has(g));
}
