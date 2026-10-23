import { useQuery } from "@tanstack/react-query";
import { History } from "lucide-react";
import { Card } from "@/components/qq";
import { listAudit } from "@/data/api";

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

// Change history: what changed, when, and by whom. One line per save.
export function QuoteHistory({ quoteId }: { quoteId: string }) {
  const { data } = useQuery({
    queryKey: ["audit", quoteId],
    queryFn: () => listAudit({ data: { quoteId } }),
  });
  return (
    <Card title="Change history">
      {!data?.length ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <History className="h-4 w-4" /> No changes recorded yet.
        </p>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto pr-1">
          {data.map((a) => (
            <li key={a.id} className="border-l-2 border-primary/30 pl-3 text-sm">
              <p className="text-xs text-muted-foreground">
                {when(a.at)}
                {a.by ? ` · ${a.by}` : ""}
              </p>
              {a.what.split("; ").map((part) => (
                <p key={part} className="leading-snug">
                  {part}
                </p>
              ))}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
