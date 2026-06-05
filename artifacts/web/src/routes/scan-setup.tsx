import React, { useState } from "react";
import { useLocation } from "wouter";
import { Card, Button, Amber } from "../components/design-system/index.js";
import { useCreateScan } from "@workspace/api-client-react";
import { Category } from "@workspace/api-client-react";

export default function ScanSetupRoute() {
  const [, setLocation] = useLocation();
  
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [category, setCategory] = useState<Category>("SETUPS");
  const [description, setDescription] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutateAsync: createScan, isPending } = useCreateScan();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValidationError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate size (8MB max)
    if (file.size > 8 * 1024 * 1024) {
      setValidationError("Image size exceeds the 8 MB limit.");
      return;
    }

    // Validate format
    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic"];
    if (!validTypes.includes(file.type) && !file.name.endsWith(".heic")) {
      setValidationError("Unsupported image format. Please upload a JPEG, PNG, WebP, or HEIC.");
      return;
    }

    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));

    // Client-side image dimensions check
    const img = new Image();
    img.src = URL.createObjectURL(file);
    img.onload = () => {
      const shorterEdge = Math.min(img.width, img.height);
      if (shorterEdge < 256) {
        setValidationError("Image dimensions too small. Shorter edge must be at least 256 px.");
        setImageFile(null);
        setImagePreview(null);
      }
    };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!imageFile) {
      setValidationError("Please select an image to scan.");
      return;
    }

    try {
      // Gather local timezone and date
      const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

      // Call API (multipart/form-data)
      const res = await createScan({
        data: {
          image: imageFile as any, // Cast to Blob
          category,
          description: description || undefined,
          localDate,
          localTz,
        }
      });

      // Navigate to reveal sequence with scan ID and reveal details passed in state/session
      sessionStorage.setItem(`reveal_${res.scan.id}`, JSON.stringify(res.reveal));
      sessionStorage.setItem(`scan_result_${res.scan.id}`, JSON.stringify(res.scan));
      setLocation(`/scan/run/${res.scan.id}`);
    } catch (err: any) {
      setValidationError(err.message || "Failed to initiate scan. Please check your daily limits.");
    }
  };

  const categories: Array<{ id: Category; label: string; desc: string }> = [
    { id: "SETUPS", label: "Setups", desc: "Workstations, battle setups, keyboard logs" },
    { id: "DRIP", label: "Drip", desc: "Streetwear, minimal fits, archive collections" },
    { id: "FITNESS", label: "Fitness", desc: "Physiques, workout forms, gym checks" },
    { id: "PETS", label: "Pets", desc: "Shibas, regal cats, goblin companions" },
    { id: "RIDES", label: "Rides", desc: "Cars, bikes, engine builds" },
    { id: "WILDCARD", label: "Wildcard", desc: "Memes, art, daily objects, random items" },
  ];

  return (
    <div className="max-w-2xl w-full mx-auto py-6 md:py-12 z-10">
      <Card className="flex flex-col gap-6">
        <div>
          <h1 className="font-mono text-xl font-bold uppercase tracking-wider text-white">Scanner Input Terminal</h1>
          <p className="text-sm text-neutral-400 mt-1">Configure your targets and verify image diagnostics before running analysis.</p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {/* File Picker */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">Image Diagnostic Target</span>
            {imagePreview ? (
              <div className="relative w-full aspect-video rounded-lg overflow-hidden border border-neutral-800 bg-black/60 flex items-center justify-center">
                <img src={imagePreview} className="object-contain w-full h-full" alt="Target preview" />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null);
                    setImagePreview(null);
                  }}
                  className="absolute top-3 right-3 bg-black/80 hover:bg-black border border-neutral-700 text-xs font-mono px-3 py-1.5 rounded text-neutral-300 hover:text-white transition-colors cursor-pointer"
                >
                  Clear Target
                </button>
              </div>
            ) : (
              <label className="flex flex-col items-center justify-center w-full aspect-video rounded-lg border-2 border-dashed border-neutral-800 hover:border-neutral-700 bg-neutral-905/30 transition-colors cursor-pointer p-6">
                <div className="flex flex-col items-center justify-center pt-5 pb-6 text-neutral-500 hover:text-neutral-400">
                  <svg className="w-10 h-10 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="mb-2 text-sm font-mono uppercase tracking-wider">Drag or Select Target Image</p>
                  <p className="text-xs text-neutral-600">JPEG, PNG, WebP, or HEIC up to 8 MB</p>
                </div>
                <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
              </label>
            )}
          </div>

          {/* Category Selector */}
          <div className="flex flex-col gap-2">
            <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">System Category Alignment</span>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {categories.map((cat) => {
                const selected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`text-left p-3 rounded border text-xs flex flex-col gap-1 transition-all duration-150 cursor-pointer ${
                      selected
                        ? "border-brand-amber bg-brand-amber/5 text-white"
                        : "border-neutral-800 bg-neutral-900/10 text-neutral-400 hover:border-neutral-700 hover:text-neutral-200"
                    }`}
                  >
                    <span className="font-mono font-bold tracking-wider uppercase">{cat.label}</span>
                    <span className="text-[10px] text-neutral-500 leading-normal">{cat.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description */}
          <div className="flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono text-xs text-neutral-400 uppercase tracking-wider">Target Context / Description</span>
              <span className="text-[10px] font-mono text-neutral-500">{description.length}/120</span>
            </div>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value.slice(0, 120))}
              placeholder="e.g. Minimalist setups, margiela outfit check (Optional)"
              className="w-full bg-neutral-950/80 border border-neutral-800 rounded px-4 py-2.5 text-sm font-sans text-white focus:outline-none focus:border-brand-amber placeholder-neutral-600 transition-colors"
            />
          </div>

          {validationError && (
            <div className="text-red-500 font-mono text-xs bg-red-950/20 border border-red-900/30 p-3 rounded">
              DIAGNOSTIC FAULT: {validationError}
            </div>
          )}

          {/* Submit */}
          <Button
            type="submit"
            variant="primary"
            disabled={isPending || !imageFile}
            className="w-full py-3.5"
          >
            {isPending ? "SCANNING TARGET PIXELS..." : "RUN SYSTEM DIAGNOSTIC SCAN"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
