import React from "react";
import { Trophy, UserRound } from "lucide-react";

function cx(...parts) {
  return parts.filter(Boolean).join(" ");
}

function getInitials(name = "") {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ initials, avatarUrl, className }) {
  return (
    <div
      className={cx(
        "h-10 w-10 rounded-full flex items-center justify-center text-xs font-semibold",
        "bg-slate-100",
        "overflow-hidden",
        className,
      )}
    >
      {avatarUrl ? (
        <img
          src={avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
        />
      ) : (
        <UserRound size={18} className="text-black/70" />
      )}
    </div>
  );
}

function RankIcon({ rank, highlight = false }) {
  return (
    <span
      className={cx(
        "text-[14px] font-extrabold",
        highlight
          ? "text-indigo-600"
          : "text-slate-500",
      )}
    >
      #{rank}
    </span>
  );
}

function Row({ rank, initials, avatarUrl, name, subtitle, percent, highlight = false, rightPill }) {
  return (
    <div
      className={cx(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2",
        highlight ? "bg-violet-50/70" : "bg-white",
      )}
    >
      <div className="flex items-center gap-1 min-w-0">
        <div className="w-6 flex items-center justify-center">
          {typeof rank === "number" ? <RankIcon rank={rank} highlight={highlight} /> : rank}
        </div>
        <Avatar
          initials={initials}
          avatarUrl={avatarUrl}
          className="text-black"
        />
        <div className="min-w-0 ml-1">
          <div className="text-sm font-semibold text-slate-900 truncate">{name}</div>
          <div className="text-[11px] text-slate-500 truncate">{subtitle}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <div className={cx("text-sm font-bold", highlight ? "text-indigo-600" : "text-black")}>
          {percent}
        </div>
        {rightPill ? (
          <span className="rounded-md bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
            {rightPill}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default function PifRateLeaderboard({
  loading = false,
  titleRight = "(#1 + you)",
  entries,
  footer,
}) {
  if (loading) return null;

  const list =
    entries?.length
      ? entries
      : [
          { name: "Eduardo", percent: "66%", subtitle: "Top performer this month" },
          { name: "Ana", percent: "33%", subtitle: "Keep pushing PIF!", isYou: true },
          { name: "Karina", percent: "29%", subtitle: "Solid pace" },
          { name: "Luis", percent: "24%", subtitle: "Room to improve" },
          { name: "Martin", percent: "18%", subtitle: "Build consistency" },
        ];

  const topEntry = list[0];
  const youIndex = list.findIndex((e) => !!e?.isYou);
  const youEntry = youIndex >= 0 ? list[youIndex] : null;

  const rows = [
    topEntry
      ? {
          entry: topEntry,
          rank: 1,
          isYou: !!topEntry?.isYou,
        }
      : null,
    youEntry && youIndex !== 0
      ? {
          entry: youEntry,
          rank: youIndex + 1,
          isYou: true,
        }
      : null,
  ].filter(Boolean);

  return (
    <div className="rounded-2xl bg-white shadow-sm border border-slate-200 overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-amber-500" />
            <div className="text-sm font-semibold text-slate-900">PIF Rate Leaderboard</div>
          </div>
          <div className="text-[11px] text-slate-400">{titleRight}</div>
        </div>
      </div>

      <div className="pb-3 flex flex-col gap-2">
        {rows.map((r, idx) => (
          <Row
            key={`${r.entry?.name ?? "entry"}-${r.rank}-${idx}`}
            rank={r.rank}
            initials={r.entry?.initials || getInitials(r.entry?.name)}
            avatarUrl={r.entry?.avatarUrl}
            name={r.isYou ? `You (${r.entry?.name ?? "—"})` : r.entry?.name ?? "—"}
            subtitle={r.entry?.subtitle || ""}
            percent={r.entry?.percent || "—"}
            highlight={!!r.isYou}
            rightPill={r.isYou ? "YOU" : undefined}
          />
        ))}
      </div>

      {footer ? (
        <div className="px-4 pb-4 text-[11px] text-slate-500 text-center">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

