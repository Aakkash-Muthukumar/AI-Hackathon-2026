"use client";

import { useEffect, useState, useMemo } from "react";
import { Assignment, getUrgency, UrgencyLevel, AssignmentSource } from "@/lib/types";
import { api } from "@/lib/api";
import { AssignmentCard } from "@/components/AssignmentCard";
import { FilterBar } from "@/components/FilterBar";
import { Header } from "@/components/Header";
import { ScaffoldLoader } from "@/components/ScaffoldLoader";
import { PlusCircle, RefreshCw } from "lucide-react";
import Link from "next/link";

interface Filters {
  urgency: UrgencyLevel | "all";
  source: AssignmentSource | "all";
  search: string;
}

export default function Dashboard() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>({
    urgency: "all",
    source: "all",
    search: "",
  });

  async function load() {
    setLoading(true);
    try {
      const data = await api.assignments.list();
      setAssignments(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    return assignments.filter((a) => {
      if (filters.urgency !== "all" && getUrgency(a.deadline) !== filters.urgency)
        return false;
      if (filters.source !== "all" && a.source !== filters.source) return false;
      if (
        filters.search &&
        !a.title.toLowerCase().includes(filters.search.toLowerCase())
      )
        return false;
      return true;
    });
  }, [assignments, filters]);

  const overallAvg =
    assignments.length > 0
      ? assignments.reduce((s, a) => s + a.overall_completion, 0) /
        assignments.length
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />

      <main className="max-w-6xl mx-auto px-6 py-8">
        {/* Hero stats */}
        <div className="mb-8 grid grid-cols-3 gap-4">
          <StatCard label="Assignments" value={assignments.length} />
          <StatCard
            label="Avg completion"
            value={`${overallAvg.toFixed(0)}%`}
          />
          <StatCard
            label="Overdue"
            value={assignments.filter((a) => getUrgency(a.deadline) === "overdue").length}
            alert
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h1 className="text-xl font-bold">Your assignments</h1>
          <div className="flex items-center gap-3">
            <FilterBar
              filters={filters}
              onChange={(f) => setFilters((prev) => ({ ...prev, ...f }))}
            />
            <button
              onClick={load}
              className="p-2 rounded-lg border border-gray-200 hover:bg-gray-100 transition-colors"
              title="Refresh"
            >
              <RefreshCw size={16} />
            </button>
            <Link
              href="/assignments/new"
              className="flex items-center gap-1.5 px-4 py-2 bg-scaffold-500 text-white text-sm font-medium rounded-lg hover:bg-scaffold-600 transition-colors"
            >
              <PlusCircle size={16} />
              New
            </Link>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="flex justify-center py-24">
            <ScaffoldLoader width={72} label="Loading assignments…" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <p className="text-lg mb-2">No assignments found</p>
            <p className="text-sm">
              Add one manually or{" "}
              <Link href="/connect" className="text-scaffold-500 hover:underline">
                connect a platform
              </Link>{" "}
              to auto-discover.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((a) => (
              <AssignmentCard key={a.id} assignment={a} />
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StatCard({
  label,
  value,
  alert = false,
}: {
  label: string;
  value: string | number;
  alert?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p
        className={`text-3xl font-bold ${
          alert && Number(value) > 0 ? "text-red-500" : "text-gray-900"
        }`}
      >
        {value}
      </p>
    </div>
  );
}
