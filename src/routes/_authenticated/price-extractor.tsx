import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { PageShell } from "@/components/bottom-nav";
import { PricePlayground } from "@/components/price-playground";
import { listBrands, listPricing, listProducts } from "@/data/api";
import { useMe } from "@/hooks/use-me";
import { recall } from "@/lib/utils";
import { LAST_BRAND, LAST_PRESET } from "@/lib/catalog";

export const Route = createFileRoute("/_authenticated/price-extractor")(
  {
    head: () => ({
      meta: [{ title: "Price Extractor — Tarko CRM" }],
    }),
    component: PriceExtractorPage,
  },
);

function PriceExtractorPage() {
  const me = useMe();
  const pricing = useQuery({
    queryKey: ["pricing"],
    queryFn: () => listPricing(),
    staleTime: 60_000,
  });
  const prods = useQuery({
    queryKey: ["products"],
    queryFn: () => listProducts(),
    staleTime: 60_000,
  });
  const brands = useQuery({
    queryKey: ["brands"],
    queryFn: () => listBrands(),
    staleTime: 5 * 60_000,
  });

  if (me.role && !me.isAdmin) {
    return (
      <PageShell title="Price Extractor" wide>
        <p className="rounded-2xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          Only admins can use the price extractor.
        </p>
      </PageShell>
    );
  }

  const loading =
    pricing.isLoading || prods.isLoading || brands.isLoading;
  const ready = pricing.data && prods.data && brands.data;

  return (
    <PageShell title="Price Extractor" wide>
      {loading && (
        <div className="h-96 animate-pulse rounded-2xl bg-secondary" />
      )}
      {ready && (
        <PricePlayground
          products={prods.data}
          pricing={pricing.data}
          brands={brands.data}
          initialBrandId={
            brands.data.find((b) => b.id === recall(LAST_BRAND))
              ?.id ?? brands.data[0]?.id
          }
          initialPresetId={
            pricing.data.presets.find(
              (p) => p.id === recall(LAST_PRESET),
            )?.id ?? pricing.data.presets[0]?.id
          }
          initialProfileId={pricing.data.activeProfileId}
        />
      )}
    </PageShell>
  );
}
