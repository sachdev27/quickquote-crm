import React from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface ProPaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  itemName?: string;
  className?: string;
}

export function ProPagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  itemName = "items",
  className = "",
}: ProPaginationProps) {
  if (totalItems <= 0) return null;

  const from = Math.min((currentPage - 1) * pageSize + 1, totalItems);
  const to = Math.min(currentPage * pageSize, totalItems);

  // Generate page numbers with ellipsis
  const getPageNumbers = () => {
    const pages: (number | "ellipsis")[] = [];
    if (totalPages <= 7) {
      for (let i = 1; i <= totalPages; i++) pages.push(i);
    } else {
      pages.push(1);
      if (currentPage > 3) pages.push("ellipsis");

      const start = Math.max(2, currentPage - 1);
      const end = Math.min(totalPages - 1, currentPage + 1);
      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (currentPage < totalPages - 2) pages.push("ellipsis");
      pages.push(totalPages);
    }
    return pages;
  };

  const pages = getPageNumbers();

  return (
    <div
      className={`flex flex-col sm:flex-row items-center justify-between gap-3 px-3 py-3 border-t border-border bg-card/60 backdrop-blur rounded-b-xl text-xs text-muted-foreground ${className}`}
    >
      <div className="flex items-center gap-2">
        <span>
          Showing <span className="font-semibold text-foreground tabular-nums">{from}</span>–
          <span className="font-semibold text-foreground tabular-nums">{to}</span> of{" "}
          <span className="font-semibold text-foreground tabular-nums">{totalItems}</span>{" "}
          {itemName}
        </span>
        {onPageSizeChange && (
          <div className="flex items-center gap-1.5 ml-2 border-l border-border pl-3">
            <span>Rows:</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                onPageSizeChange(Number(e.target.value));
                onPageChange(1);
              }}
              className="h-7 rounded-md border border-border bg-background px-1.5 text-xs font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {pageSizeOptions.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon"
          aria-label="First page"
          className="h-8 w-8 rounded-lg"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(1)}
        >
          <ChevronsLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Previous page"
          className="h-8 w-8 rounded-lg"
          disabled={currentPage <= 1}
          onClick={() => onPageChange(currentPage - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 mx-1">
          {pages.map((p, idx) =>
            p === "ellipsis" ? (
              <span key={`ellipsis-${idx}`} className="px-1.5 py-1 text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === currentPage ? "default" : "outline"}
                size="icon"
                className={`h-8 w-8 rounded-lg text-xs font-semibold tabular-nums ${
                  p === currentPage
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "hover:bg-secondary"
                }`}
                onClick={() => onPageChange(p)}
              >
                {p}
              </Button>
            ),
          )}
        </div>

        <Button
          variant="outline"
          size="icon"
          aria-label="Next page"
          className="h-8 w-8 rounded-lg"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(currentPage + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          aria-label="Last page"
          className="h-8 w-8 rounded-lg"
          disabled={currentPage >= totalPages}
          onClick={() => onPageChange(totalPages)}
        >
          <ChevronsRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
