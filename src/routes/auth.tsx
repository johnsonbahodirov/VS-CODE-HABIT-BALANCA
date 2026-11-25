import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { friendlyErrorMessage, showFriendlyError } from "@/lib/feedback";
import { Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Balance" },
      { name: "description", content: "Sign in to track your habits and work time balance." },
      { property: "og:title", content: "Sign in — Balance" },
      {
        property: "og:description",
        content: "Sign in to track your habits and work time balance.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [googleError, setGoogleError] = useState("");

  useEffect(() => {
    const callbackParams = new URL(window.location.href).searchParams;
    const callbackError = callbackParams.get("error");
    const callbackErrorCode = callbackParams.get("error_code");
    if (callbackError && import.meta.env.DEV) {
      console.warn("[Supabase Auth] OAuth callback returned an error", {
        error: callbackError,
        code: callbackErrorCode ?? undefined,
      });
    }

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (import.meta.env.DEV) {
        console.info("[Supabase Auth] Auth state changed", {
          event,
          hasSession: Boolean(session),
        });
      }
      if (
        session &&
        (event === "SIGNED_IN" || event === "INITIAL_SESSION" || event === "TOKEN_REFRESHED")
      ) {
        void navigate({ to: "/today", replace: true });
      }
    });

    void supabase.auth.initialize().then(({ error }) => {
      if (error && import.meta.env.DEV) {
        console.warn("[Supabase Auth] Session initialization failed", {
          name: error.name,
          code: "code" in error ? error.code : undefined,
        });
      }
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error && import.meta.env.DEV) {
        console.warn("[Supabase Auth] getSession failed", {
          name: error.name,
          code: "code" in error ? error.code : undefined,
        });
      }
      if (data.session) {
        void navigate({ to: "/today", replace: true });
      }
    });

    return () => data.subscription.unsubscribe();
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "up") {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { emailRedirectTo: `${window.location.origin}/auth` },
        });
        if (error) {
          showFriendlyError(error);
        } else if (data.session) {
          toast.success("Account created. You are signed in.");
        } else {
          toast.success("Account created. Check your email if confirmation is required.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (error) showFriendlyError(error);
      }
    } catch (error) {
      showFriendlyError(error);
    } finally {
      setBusy(false);
    }
  };

  const signInWithGoogle = async () => {
    setGoogleBusy(true);
    setGoogleError("");
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth`,
        },
      });
      if (error) throw error;
    } catch (error) {
      const message = friendlyErrorMessage(error);
      setGoogleError(message);
      toast.error(message);
    } finally {
      setGoogleBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <span className="font-mono text-sm font-bold tracking-widest text-primary">BALANCE</span>
          <h1 className="mt-2 text-3xl font-bold">
            {mode === "in" ? "Welcome back" : "Create account"}
          </h1>
        </div>
        <Button
          type="button"
          variant="outline"
          size="lg"
          className="w-full"
          disabled={busy || googleBusy}
          onClick={() => void signInWithGoogle()}
        >
          <span aria-hidden="true" className="inline-flex font-bold tracking-tight">
            <span className="text-[#4285f4]">G</span>
            <span className="text-[#ea4335]">o</span>
            <span className="text-[#fbbc05]">o</span>
            <span className="text-[#4285f4]">g</span>
            <span className="text-[#34a853]">l</span>
            <span className="text-[#ea4335]">e</span>
          </span>
          <span>{googleBusy ? "Opening…" : "Continue with Google"}</span>
        </Button>
        {googleError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            {googleError}
          </p>
        )}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          or continue with email
          <span className="h-px flex-1 bg-border" />
        </div>
        <form onSubmit={submit} className="space-y-3">
          <Input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-11 rounded-xl bg-surface"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete={mode === "in" ? "current-password" : "new-password"}
              required
              minLength={6}
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-11 rounded-xl bg-surface pr-11"
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((value) => !value)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          <Button type="submit" variant="neon" size="lg" className="w-full" disabled={busy}>
            {mode === "in" ? "Sign in" : "Sign up"}
          </Button>
        </form>
        <button
          type="button"
          onClick={() => setMode(mode === "in" ? "up" : "in")}
          className="w-full text-center text-sm text-muted-foreground hover:text-foreground"
        >
          {mode === "in" ? "No account? Sign up" : "Have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}
