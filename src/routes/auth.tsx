import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — PipeQuote" },
      { name: "description", content: "Sign in to PipeQuote to create and manage your proforma quotations." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [awaitingConfirm, setAwaitingConfirm] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) {
          toast.error(error.message);
          return;
        }
        navigate({ to: "/dashboard" });
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) {
          toast.error(error.message);
          return;
        }
        if (data.session) {
          navigate({ to: "/dashboard" });
        } else {
          setAwaitingConfirm(true);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function forgotPassword() {
    if (!email) {
      toast.error("Enter your email first, then tap Forgot password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("Reset link sent — check your email.");
    } finally {
      setBusy(false);
    }
  }

  async function signInGoogle() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  async function signInLovable() {
    const { lovable } = await import("@/integrations/lovable/index");
    const result = await lovable.auth.signInWithOAuth("lovable", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error.message ?? "Sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard" });
  }

  if (awaitingConfirm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold text-foreground">Check your email</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We sent a confirmation link to <span className="font-medium text-foreground">{email}</span>.
            Tap it to activate your account, then sign in.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 py-10">
      <div className="w-full max-w-sm">
        <h1 className="text-3xl font-bold text-foreground">PipeQuote</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "signin" ? "Sign in to your quotations." : "Create your account to get started."}
        </p>

        <form onSubmit={submit} className="mt-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <Button type="submit" disabled={busy} className="h-11 text-base">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </Button>
        </form>

        {mode === "signin" && (
          <button
            type="button"
            onClick={forgotPassword}
            disabled={busy}
            className="mt-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
          >
            Forgot password?
          </button>
        )}

        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs uppercase tracking-wide text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="flex flex-col gap-3">
          <Button type="button" variant="outline" className="h-11" onClick={signInGoogle} disabled={busy}>
            Continue with Google
          </Button>
          <Button type="button" variant="outline" className="h-11" onClick={signInLovable} disabled={busy}>
            Continue with Lovable
          </Button>
        </div>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {mode === "signin" ? "New here?" : "Already have an account?"}{" "}
          <button
            type="button"
            className="font-medium text-primary underline-offset-4 hover:underline"
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          >
            {mode === "signin" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
