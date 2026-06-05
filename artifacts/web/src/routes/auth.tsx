import React, { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Card, Button, Amber } from "../components/design-system/index.js";
import { supabase } from "../lib/supabase.js";
import { useGetMe, useSetMyUsername } from "@workspace/api-client-react";

export function AuthCallbackRoute() {
  const [, setLocation] = useLocation();
  const { data: me, refetch } = useGetMe();

  useEffect(() => {
    // Wait for Supabase to parse URL hash/code and set session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        refetch().then((res) => {
          if (res.data?.needsUsername) {
            setLocation("/auth/username");
          } else {
            setLocation("/me");
          }
        });
      } else {
        setLocation("/");
      }
    });
  }, [setLocation, refetch]);

  return (
    <div className="flex-1 flex items-center justify-center font-mono text-sm text-neutral-400">
      AUTHENTICATING SESSION WITH LEDGER AUTH...
    </div>
  );
}

export function AuthUsernameRoute() {
  const [, setLocation] = useLocation();

  const [usernameInput, setUsernameInput] = useState("");
  const [ruleErrors, setRuleErrors] = useState<{
    length?: boolean;
    chars?: boolean;
    uniqueness?: boolean;
  }>({});
  const [serverError, setServerError] = useState<string | null>(null);

  const { data: me, refetch: refetchMe } = useGetMe();
  const { mutateAsync: setUsername, isPending } = useSetMyUsername();

  useEffect(() => {
    // Basic redirect if they shouldn't be here
    if (me && !me.needsUsername) {
      setLocation("/me");
    }
  }, [me, setLocation]);

  const validateUsername = (val: string) => {
    const errors: typeof ruleErrors = {};
    if (val.length < 3 || val.length > 20) {
      errors.length = true;
    }
    if (!/^[a-z0-9_]+$/.test(val)) {
      errors.chars = true;
    }
    setRuleErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleUsernameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.toLowerCase().replace(/\s+/g, "");
    setUsernameInput(val);
    validateUsername(val);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError(null);

    if (!validateUsername(usernameInput)) {
      return;
    }

    try {
      await setUsername({ data: { username: usernameInput } });
      await refetchMe();
      setLocation("/me");
    } catch (err: any) {
      if (err.message && err.message.includes("unique")) {
        setRuleErrors((prev) => ({ ...prev, uniqueness: true }));
      } else {
        setServerError(err.message || "Failed to set username.");
      }
    }
  };

  return (
    <div className="max-w-md w-full mx-auto py-12 z-10">
      <Card className="flex flex-col gap-6">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-white">Choose Username</h1>
          <p className="text-xs text-neutral-400 mt-1">Select a unique handle to register your identity in the ledger.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">Username Handle</span>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-neutral-500">@</span>
              <input
                type="text"
                value={usernameInput}
                onChange={handleUsernameChange}
                placeholder="operator_handle"
                className="w-full bg-neutral-950/80 border border-neutral-800 rounded pl-8 pr-4 py-2.5 text-sm font-mono text-white focus:outline-none focus:border-brand-amber placeholder-neutral-700 transition-colors"
              />
            </div>
          </div>

          {/* Validation Rules Checklist */}
          <div className="flex flex-col gap-2.5 bg-black/40 border border-neutral-900 p-4 rounded-lg text-xs font-mono">
            <span className="text-neutral-500 uppercase tracking-wider text-[10px]">DIAGNOSTIC CRITERIA</span>
            <div className="flex items-center gap-2">
              <span className={ruleErrors.length ? "text-red-500" : "text-green-500"}>
                {ruleErrors.length ? "✗" : "✓"}
              </span>
              <span className={ruleErrors.length ? "text-red-400" : "text-neutral-400"}>
                Between 3 and 20 characters in length
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={ruleErrors.chars ? "text-red-500" : "text-green-500"}>
                {ruleErrors.chars ? "✗" : "✓"}
              </span>
              <span className={ruleErrors.chars ? "text-red-400" : "text-neutral-400"}>
                Only lowercase letters, numbers, and underscores
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className={ruleErrors.uniqueness ? "text-red-500" : "text-green-500"}>
                {ruleErrors.uniqueness ? "✗" : "✓"}
              </span>
              <span className={ruleErrors.uniqueness ? "text-red-400" : "text-neutral-400"}>
                Must be unique (not already claimed)
              </span>
            </div>
          </div>

          {serverError && (
            <div className="text-red-500 font-mono text-xs bg-red-950/20 border border-red-900/30 p-3 rounded">
              REGISTRATION ERROR: {serverError}
            </div>
          )}

          <Button
            type="submit"
            variant="primary"
            disabled={isPending || Object.values(ruleErrors).some(Boolean) || !usernameInput}
            className="w-full"
          >
            {isPending ? "Claiming Username..." : "Secure Identity"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
