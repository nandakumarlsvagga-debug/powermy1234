import React from "react";
import { Link } from "wouter";
import { Wordmark, Button } from "../components/design-system/index.js";

export default function LandingRoute() {
  return (
    <div className="flex flex-col items-center justify-center flex-1 text-center py-12 md:py-24 relative overflow-hidden">
      {/* Background Glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-brand-amber/5 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/3 w-[300px] h-[300px] bg-hud-cyan/5 rounded-full blur-[100px] pointer-events-none" />

      {/* Hero Section */}
      <div className="z-10 max-w-3xl mx-auto flex flex-col items-center gap-6">
        <div className="font-mono text-xs uppercase tracking-[0.25em] text-brand-amber bg-brand-amber/10 border border-brand-amber/20 px-3 py-1 rounded-full mb-4 animate-pulse">
          V1.0 Dual-Pass Cultural Engine Live
        </div>

        <Wordmark width={380} className="w-full max-w-[280px] sm:max-w-[380px]" />
        
        <p className="font-sans text-neutral-400 text-base sm:text-lg max-w-xl leading-relaxed mt-4">
          Upload any setup, outfit, physique, car, pet, or cultural artifact. Get scored deterministically by our dual-pass model. Uncover anomalies, claim your rank, and share your card.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 mt-8 w-full sm:w-auto">
          <Link href="/scan">
            <Button variant="primary" className="w-full sm:w-auto text-base py-3 px-8">
              Analyze Object
            </Button>
          </Link>
          <Link href="/feed">
            <Button variant="secondary" className="w-full sm:w-auto text-base py-3 px-8">
              Explore Feed
            </Button>
          </Link>
        </div>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 max-w-4xl w-full mt-24 z-10 text-left">
        {[
          { title: "SETUPS", desc: "Minimalist workstations, loop builds, vintage command desks." },
          { title: "DRIP", desc: "Grail archives, thrift remixes, aesthetic styling fits." },
          { title: "FITNESS", desc: "Championship physiques, disciplined form, stamina cores." },
          { title: "PETS", desc: "Doge lineages, chaos goblins, divine regal companions." },
          { title: "RIDES", desc: "Hypercar grails, vintage Europeans, track weapons." },
          { title: "WILDCARD", desc: "Internet canon memes, historical objects, everyday artifacts." },
        ].map((feat) => (
          <div key={feat.title} className="bg-graphite border border-neutral-900 p-5 rounded-lg flex flex-col gap-2 hover:border-neutral-800 transition-colors duration-200">
            <span className="font-mono text-xs tracking-wider text-brand-amber font-semibold">{feat.title}</span>
            <p className="font-sans text-xs text-neutral-500 leading-normal">{feat.desc}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
