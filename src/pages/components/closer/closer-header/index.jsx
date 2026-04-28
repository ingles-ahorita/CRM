import React, { useRef, useState } from "react";
import { BarChart3, Loader2, LogOut, Pencil, Play } from "lucide-react";
import { supabase } from "../../../../lib/supabaseClient";

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

export default function CloserHeader({
  name = "Ana",
  closerId,
  avatarUrl,
  onAvatarSaved,
  monthLabel = "April 2026",
  lastUpdatedLabel = "Last updated: 5 min ago",
  // promoLabel = "PF - $225 commission vs Dowsell - $75 90 - Close PE: earn 3x more",
  onStartShift: _onStartShift,
  startShiftLabel: _startShiftLabel = "Start Shift",
  isShiftActive: _isShiftActive = false,
  onFullStats,
}) {
  const initials = getInitials(name);
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const handlePickFile = () => {
    setUploadError("");
    fileInputRef.current?.click();
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files?.[0];
    // allow selecting the same file again
    e.target.value = "";

    if (!file) return;
    if (!closerId) {
      setUploadError("Missing closer id");
      return;
    }

    const maxBytes = 2 * 1024 * 1024; // 2MB
    const isImage = /^image\/(png|jpe?g|webp)$/i.test(file.type);
    if (!isImage) {
      setUploadError("Please upload a PNG/JPG/WebP image.");
      return;
    }
    if (file.size > maxBytes) {
      setUploadError("Image too large (max 2MB).");
      return;
    }

    // Validate dimensions (require roughly-square avatar within reasonable bounds)
    const dims = await new Promise((resolve) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });

    if (!dims) {
      setUploadError("Could not read the image. Try a different file.");
      return;
    }

    const minPx = 128;
    const maxPx = 2048;
    const { width, height } = dims;
    if (width < minPx || height < minPx) {
      setUploadError(`Image too small (min ${minPx}×${minPx}).`);
      return;
    }
    if (width > maxPx || height > maxPx) {
      setUploadError(`Image too large (max ${maxPx}×${maxPx}).`);
      return;
    }
    const ratio = width / height;
    if (ratio < 0.85 || ratio > 1.15) {
      setUploadError("Please upload a square (or near-square) profile photo.");
      return;
    }

    setUploading(true);
    setUploadError("");

    try {
      const bucket = "closer-avatars";
      const safeName = String(file.name || "avatar").replace(/[^\w.-]+/g, "_");
      const ext = safeName.includes(".") ? safeName.split(".").pop() : "png";
      const objectPath = `closers/${closerId}/avatar_${Date.now()}.${ext}`;

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(objectPath, file, {
          upsert: true,
          contentType: file.type,
          cacheControl: "3600",
        });

      if (uploadError) {
        const msg = String(uploadError?.message || "");
        if (msg.toLowerCase().includes("bucket") && msg.toLowerCase().includes("not found")) {
          throw new Error(
            "Storage bucket missing: create `closer-avatars` bucket (public) or run the migration, then try again.",
          );
        }
        throw uploadError;
      }

      const { data: publicData } = supabase.storage
        .from(bucket)
        .getPublicUrl(objectPath);

      const publicUrl = publicData?.publicUrl || "";
      if (!publicUrl) throw new Error("Failed to get public URL");

      const { error: dbError } = await supabase
        .from("closers")
        .update({ avatar_url: publicUrl })
        .eq("id", closerId);

      if (dbError) {
        const msg = String(dbError?.message || "");
        if (msg.toLowerCase().includes("avatar_url") && msg.toLowerCase().includes("does not exist")) {
          throw new Error(
            "DB not migrated: `closers.avatar_url` missing. Please run the migration then try again.",
          );
        }
        throw dbError;
      }

      onAvatarSaved?.(publicUrl);
    } catch (err) {
      console.warn("[CloserHeader] avatar upload failed:", err?.message || err);
      setUploadError(err?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="w-full">
      <div
        className={cx(
          "w-full",
          "rounded-xl",
          "px-4 py-3 sm:px-5 sm:py-4",
          "flex items-center justify-between gap-3",
          "shadow-[0_10px_30px_rgba(2,6,23,0.35)]",
          "border border-white/10",
          "bg-gradient-to-b from-slate-900 to-slate-950",
        )}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="relative">
            <div
              onClick={handlePickFile}
              className={cx(
                "h-11 w-11 rounded-full overflow-hidden cursor-pointer",
                "flex items-center justify-center",
                "shadow-inner",
                avatarUrl ? "bg-slate-800" : "bg-indigo-600",
                "ring-2 ring-white/20",
                "focus:outline-none focus:ring-2 focus:ring-indigo-400/60",
                "transition",
                uploading ? "opacity-80 cursor-wait" : "hover:opacity-95",
                uploading ? "pointer-events-none" : null,
              )}
              title="Upload profile photo"
              aria-label="Upload profile photo"
              aria-disabled={uploading ? "true" : "false"}
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={`${name} profile`}
                  className="h-full w-full object-cover"
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              ) : (
                <span className="text-white font-semibold text-sm">{initials}</span>
              )}
            </div>
            <div className="absolute inset-0 rounded-full ring-2 ring-white/20 pointer-events-none" />
            {uploading ? (
              <div
                className={cx(
                  "absolute inset-0 rounded-full",
                  "bg-slate-950/55 backdrop-blur-[1px]",
                  "flex items-center justify-center",
                  "pointer-events-none",
                )}
                aria-hidden="true"
              >
                <Loader2 size={16} className="text-white animate-spin" />
              </div>
            ) : null}
            <div
              className={cx(
                "absolute -bottom-1 -right-1",
                "h-5 w-5 rounded-full",
                "flex items-center justify-center",
                "bg-slate-900/90 border border-white/15",
                "shadow-[0_6px_16px_rgba(2,6,23,0.45)]",
                "pointer-events-none",
              )}
              aria-hidden="true"
            >
              <Pencil size={12} className="text-slate-100" />
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-white font-semibold text-[15px] sm:text-[16px] leading-tight truncate">
              {`Closer Dashboard: ${name}`}
            </div>
            <div className="text-slate-300 text-xs leading-tight truncate">
              <span className="text-slate-200/90">{monthLabel}</span>
              <span className="mx-2 text-slate-500">•</span>
              <span className="text-slate-300">{lastUpdatedLabel}</span>
            </div>
            {uploadError ? (
              <div className="mt-1 text-[11px] font-semibold text-rose-300 truncate">
                {uploadError}
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          {/* <div
            className={cx(
              "hidden md:flex items-center",
              "max-w-[540px]",
              "px-3 py-1.5",
              "rounded-lg",
              "border border-amber-400/30",
              "bg-gradient-to-r from-amber-500/35 to-orange-500/25",
              "text-amber-50 text-xs",
              "shadow-[0_8px_18px_rgba(245,158,11,0.14)]",
            )}
            title={promoLabel}
          >
            <span className="truncate">{promoLabel}</span>
          </div> */}

          <button
            type="button"
            onClick={onFullStats}
            className={cx(
              "h-9",
              "px-3",
              "rounded-lg",
              "inline-flex items-center gap-2",
              "text-xs font-semibold",
              "text-slate-100",
              "bg-white/10 hover:bg-white/15",
              "border border-white/15",
              "backdrop-blur",
              "transition",
            )}
          >
            <BarChart3 size={16} className="text-slate-200" />
            <span>Full Stats</span>
          </button>

          {/* <button
            type="button"
            onClick={onStartShift}
            className={cx(
              "h-9",
              "px-3.5",
              "rounded-lg",
              "inline-flex items-center gap-2",
              "text-xs font-semibold",
              "text-white",
              isShiftActive
                ? "bg-rose-600 hover:bg-rose-500"
                : "bg-emerald-600 hover:bg-emerald-500",
              "shadow-[0_12px_24px_rgba(16,185,129,0.25)]",
              "transition",
            )}
          >
            {isShiftActive ? (
              <LogOut size={16} className="text-white/95" />
            ) : (
              <Play size={16} className="text-white/95" />
            )}
            <span>{startShiftLabel}</span>
          </button> */}
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />
    </div>
  );
}
