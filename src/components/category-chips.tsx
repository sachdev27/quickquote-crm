import { Chips } from "@/components/qq";
import { CATEGORY_LABELS, PRODUCT_GROUPS, categoryDefaults } from "@/lib/quote";

// Two-level picker for the catalog tree: parent group chips (only when more than one group has
// subcategories), then that group's subcategory chips. `extra` options (e.g. "Custom") sit at the end.
export function CategoryChips<E extends string = never>({
  value,
  onChange,
  extra = [],
}: {
  value: string;
  onChange: (v: string | E) => void;
  extra?: { value: E; label: string }[];
}) {
  const cats = Object.keys(CATEGORY_LABELS);
  const parentOf = (c: string) => categoryDefaults(c).parent ?? "";
  const parents = PRODUCT_GROUPS.filter((g) => cats.some((c) => parentOf(c) === g.id));
  const isExtra = extra.some((x) => x.value === value);
  const parent = isExtra ? "" : parentOf(value);
  const shown = parents.length > 1 && parent ? cats.filter((c) => parentOf(c) === parent) : cats;
  return (
    <div className="space-y-2">
      {parents.length > 1 && (
        <Chips
          label="Group"
          compact
          value={parent}
          onChange={(p) => {
            const first = cats.find((c) => parentOf(c) === p);
            if (first) onChange(first);
          }}
          options={parents.map((g) => ({ value: g.id, label: g.label }))}
        />
      )}
      <Chips<string>
        label="Category"
        value={value}
        onChange={onChange}
        options={[...shown.map((c) => ({ value: c, label: CATEGORY_LABELS[c]! })), ...extra]}
      />
    </div>
  );
}
