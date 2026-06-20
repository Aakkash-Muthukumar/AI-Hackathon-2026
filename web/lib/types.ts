export type AssignmentSource =
  | "canvas"
  | "notion"
  | "google_classroom"
  | "trello"
  | "jira"
  | "asana"
  | "clickup"
  | "odoo"
  | "manual";

export interface RubricItem {
  criterion: string;
  points?: number;
  description: string;
  weight?: number;
}

export interface Task {
  id: string;
  title: string;
  completion: number; // 0–100
  success_criteria: string[];
  expected_outputs: string[];
  rubric_alignment: string[];
  missing_requirements: string[];
}

export interface Assignment {
  id: string;
  title: string;
  deadline?: string;
  source: AssignmentSource;
  prompt: string;
  rubric: RubricItem[];
  tasks: Task[];
  overall_completion: number;
  document_url?: string;
  created_at: string;
  updated_at: string;
}

export type UrgencyLevel = "overdue" | "today" | "this_week" | "later";

export function getUrgency(deadline?: string): UrgencyLevel {
  if (!deadline) return "later";
  const d = new Date(deadline);
  const diffDays = (d.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  if (diffDays < 0) return "overdue";
  if (diffDays < 1) return "today";
  if (diffDays < 7) return "this_week";
  return "later";
}

export const SOURCE_LABELS: Record<AssignmentSource, string> = {
  canvas: "Canvas",
  notion: "Notion",
  google_classroom: "Google Classroom",
  trello: "Trello",
  jira: "Jira",
  asana: "Asana",
  clickup: "ClickUp",
  odoo: "Odoo",
  manual: "Manual",
};

export const URGENCY_COLORS: Record<UrgencyLevel, string> = {
  overdue: "bg-red-100 text-red-700",
  today: "bg-orange-100 text-orange-700",
  this_week: "bg-yellow-100 text-yellow-700",
  later: "bg-green-100 text-green-700",
};
