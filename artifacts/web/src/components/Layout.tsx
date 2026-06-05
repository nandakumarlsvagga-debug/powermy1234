import React, { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Wordmark, Button } from "./design-system/index.js";
import { supabase } from "../lib/supabase.js";
import { useGetMe } from "@workspace/api-client-react";

export const Layout = ({ children }: { children: React.ReactNode }) => {
  const [location, setLocation] = useLocation();
  const [user, setUser] = useState<any>(null);
  
  // Fetch current user details / anonymous quota state
  const { data: me, refetch: refetchMe } = useGetMe();

  useEffect(() => {
    // Sync active session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      refetchMe();
    });

    return () => subscription.unsubscribe();
  }, [refetchMe]);

  const handleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setLocation("/");
  };

  const navLinks = [
    { href: "/feed", label: "Feed" },
    { href: "/leaderboards", label: "Leaderboards" },
    { href: "/scan", label: "Scan Now" },
  ];

  return (
    <div className="min-h-screen bg-matte-black text-white flex flex-col font-sans relative selection:bg-brand-amber/20 selection:text-brand-amber">
      {/* Premium Header */}
      <header className="sticky top-0 z-50 w-full backdrop-blur-md bg-matte-black/70 border-b border-neutral-900 transition-all duration-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 cursor-pointer active:scale-95 transition-transform duration-150">
            <Wordmark width={130} />
          </Link>

          {/* Navigation Links */}
          <nav className="hidden md:flex items-center gap-8">
            {navLinks.map((link) => {
              const active = location === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`font-mono text-sm tracking-wider uppercase transition-colors duration-200 cursor-pointer relative py-1 ${
                    active ? "text-white font-bold" : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {link.label}
                  {active && (
                    <span className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-amber" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* User Section / CTA */}
          <div className="flex items-center gap-4">
            {me?.member ? (
              <div className="flex items-center gap-4">
                <Link href={`/u/${me.member.username}`} className="font-mono text-sm text-neutral-300 hover:text-white cursor-pointer bg-neutral-900/40 px-3 py-1.5 rounded border border-neutral-800 hover:border-neutral-700 transition-all">
                  @{me.member.username}
                </Link>
                <Button variant="ghost" onClick={handleLogout} className="px-3 py-1">
                  Log Out
                </Button>
              </div>
            ) : me?.dailyQuota ? (
              <div className="flex items-center gap-3">
                <div className="hidden lg:flex flex-col items-end">
                  <span className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Anon Quota</span>
                  <span className="text-xs font-mono text-neutral-300">
                    {me.dailyQuota.used} / {me.dailyQuota.limit} Used
                  </span>
                </div>
                <Button variant="secondary" onClick={handleLogin} className="text-xs py-1.5 px-3">
                  Sign In
                </Button>
              </div>
            ) : (
              <Button variant="secondary" onClick={handleLogin} className="text-xs py-1.5 px-3">
                Sign In
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 flex flex-col">
        {children}
      </main>

      {/* Footer */}
      <footer className="w-full border-t border-neutral-900 bg-black/40 py-8 mt-auto text-neutral-600 font-mono text-xs">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <span>© {new Date().getFullYear()} POWERLVL. All rights reserved.</span>
          <div className="flex gap-6">
            <a href="#" className="hover:text-neutral-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-neutral-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-neutral-400 transition-colors">API Spec</a>
          </div>
        </div>
      </footer>
    </div>
  );
};
