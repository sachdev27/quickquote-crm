import { createFileRoute, Link } from "@tanstack/react-router";
import { Calculator, Users, Share2 } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Tarko CRM — Quick Quotes for HDPE Pipe, Sprinklers & Fittings" },
      {
        name: "description",
        content:
          "Create professional proforma quotations for HDPE pipes in under a minute — rate calculation with GST, customer CRM, PDF and WhatsApp sharing.",
      },
      { property: "og:title", content: "Tarko CRM — Quick Quotes for HDPE Pipe, Sprinklers & Fittings" },
      {
        property: "og:description",
        content:
          "Create professional proforma quotations for HDPE pipes in under a minute — rate calculation with GST, customer CRM, PDF and WhatsApp sharing.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-6 py-12">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Sakhi Industries
        </p>
        <h1 className="mt-3 text-4xl font-bold leading-tight text-foreground">
          Proforma quotations in <span className="text-primary">under a minute</span>
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted-foreground">
          Pick a pipe size from the chart, set your raw material, transport and production costs,
          add your margin — the app calculates the rate and GST for you. Save customers, share on
          WhatsApp, print a PDF.
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <Link
            to="/dashboard"
            className="inline-flex h-12 items-center justify-center rounded-xl bg-primary text-base font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Open app
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-5">
          {[
            {
              icon: Calculator,
              title: "Rate calculator",
              text: "Raw material + transport + production + margin, then GST on top.",
            },
            {
              icon: Users,
              title: "Customer CRM",
              text: "Keep your customers, phones and quote history in one place.",
            },
            {
              icon: Share2,
              title: "Share instantly",
              text: "Send on WhatsApp or print a clean proforma PDF.",
            },
          ].map(({ icon: Icon, title, text }) => (
            <div key={title} className="flex items-start gap-3">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                <Icon className="h-4.5 w-4.5" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-sm text-muted-foreground">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
