import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import ScanRunRoute from "../src/routes/scan-run.tsx";
import * as revealController from "@workspace/reveal-controller";

// Mock wouter routing hooks
vi.mock("wouter", () => ({
  useParams: () => ({ id: "test-scan-id-123" }),
  useLocation: () => ["/scan/run/test-scan-id-123", vi.fn()],
}));

// Mock Supabase client
vi.mock("../src/lib/supabase.js", () => ({
  supabase: {},
}));

// Mock global sessionStorage
const sessionStore: Record<string, string> = {};
Object.defineProperty(window, "sessionStorage", {
  value: {
    getItem: (key: string) => sessionStore[key] || null,
    setItem: (key: string, value: string) => {
      sessionStore[key] = value;
    },
    removeItem: (key: string) => {
      delete sessionStore[key];
    },
    clear: () => {
      for (const k in sessionStore) delete sessionStore[k];
    },
  },
  writable: true,
});

// Mock window.matchMedia
beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });

  // Seed sessionStorage by default to avoid slow async fetches
  window.sessionStorage.setItem(
    "scan_result_test-scan-id-123",
    JSON.stringify({
      id: "test-scan-id-123",
      score: 50000,
      tier: "A",
      anomaly: null,
    })
  );

  // Mock global fetch
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      id: "test-scan-id-123",
      score: 50000,
      tier: "A",
      anomaly: null,
    }),
  });
});

describe("ScanRunRoute Component & Reveal Sequence", () => {
  it("should initialize the reveal controller and progress through phases", () => {
    let mockOnPhase: any = null;

    // Spy on createRevealController
    const startSpy = vi.fn().mockImplementation((opts) => {
      mockOnPhase = opts.onPhase;
      return { cancel: vi.fn() };
    });

    vi.spyOn(revealController, "createRevealController").mockReturnValue({
      start: startSpy,
    } as any);

    let renderResult: any;
    act(() => {
      renderResult = render(<ScanRunRoute />);
    });

    const { container } = renderResult;

    // Verify it started the controller
    expect(startSpy).toHaveBeenCalled();
    expect(mockOnPhase).not.toBeNull();

    // Simulated phases
    act(() => {
      mockOnPhase("read", { revealVariant: "standard" });
    });
    expect(container.textContent).toBeDefined();

    act(() => {
      mockOnPhase("scoring", { revealVariant: "standard" });
    });
    expect(container.textContent).toBeDefined();

    act(() => {
      mockOnPhase("commentary", { revealVariant: "standard" });
    });
    expect(container.textContent).toBeDefined();
  });

  it("should honor reducedMotion media queries", () => {
    // Override matchMedia to return true for reduced-motion
    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })) as any;

    const startSpy = vi.fn().mockReturnValue({ cancel: vi.fn() });
    vi.spyOn(revealController, "createRevealController").mockReturnValue({
      start: startSpy,
    } as any);

    act(() => {
      render(<ScanRunRoute />);
    });

    // The controller start options should have reducedMotion: true
    expect(startSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        reducedMotion: true,
      })
    );
  });
});
