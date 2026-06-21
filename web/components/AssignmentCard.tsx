"use client";

import Link from "next/link";
import { Assignment, getUrgency, URGENCY_COLORS, SOURCE_LABELS, UrgencyLevel } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";
import { Clock, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import clsx from "clsx";

const URGENCY_LABELS: Record<UrgencyLevel, string> = {
  overdue: "Overdue",
  today: "Due today",
  this_week: "This week",
  later: "Upcoming",
};

interface Props {
  assignment: Assignment;
}

export function AssignmentCard({ assignment }: Props) {
  const urgency = getUrgency(assignment.deadline);
  const deadlineLabel = assignment.deadline
    ? formatDistanceToNow(new Date(assignment.deadline), { addSuffix: true })
    : "No deadline";

  return (
    <Link href={`/assignments/${assignment.id}`}>
      <div className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:shadow-md hover:border-scaffold-500 transition-all duration-200 cursor-pointer">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="font-semibold text-gray-900 group-hover:text-scaffold-600 transition-colors line-clamp-2">
            {assignment.title}
          </h3>
          <span
            className={clsx(
              "shrink-0 text-xs font-medium px-2 py-0.5 rounded-full",
              assignment.status === "completed"
                ? "bg-green-100 text-green-700"
                : URGENCY_COLORS[urgency]
            )}
          >
            {assignment.status === "completed" ? "Completed" : URGENCY_LABELS[urgency]}
          </span>
        </div>

        <div className="mb-4">
          <ProgressBar value={assignment.overall_completion} />
        </div>

        <div className="flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-3">
            <span className="px-2 py-0.5 bg-gray-100 rounded-md font-medium">
              {SOURCE_LABELS[assignment.source]}
            </span>
            <span className="flex items-center gap-1">
              <Clock size={11} />
              {deadlineLabel}
            </span>
          </div>
          {assignment.document_url && (
            <a
              href={assignment.document_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 hover:text-scaffold-500 transition-colors"
            >
              Open doc <ExternalLink size={11} />
            </a>
          )}
        </div>
      </div>
    </Link>
  );
}
