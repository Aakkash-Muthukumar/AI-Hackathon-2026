"use client";

import { AssignmentSource, UrgencyLevel } from "@/lib/types";
import clsx from "clsx";

interface Filters {
  urgency: UrgencyLevel | "all";
  source: AssignmentSource | "all";
  search: string;
}

interface Props {
  filters: Filters;
  onChange: (f: Partial<Filters>) => void;
}

const URGENCIES: { value: UrgencyLevel | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "this_week", label: "This week" },
  { value: "later", label: "Later" },
];

export function FilterBar({ filters, onChange }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="search"
        placeholder="Search assignments…"
        value={filters.search}
        onChange={(e) => onChange({ search: e.target.value })}
        className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-scaffold-500"
      />

      <div className="flex items-center gap-1 rounded-lg bg-gray-100 p-1">
        {URGENCIES.map((u) => (
          <button
            key={u.value}
            onClick={() => onChange({ urgency: u.value })}
            className={clsx(
              "px-3 py-1 rounded-md text-xs font-medium transition-all",
              filters.urgency === u.value
                ? "bg-white shadow text-scaffold-700"
                : "text-gray-500 hover:text-gray-700"
            )}
          >
            {u.label}
          </button>
        ))}
      </div>
    </div>
  );
}
