"use client";

import { useState, useActionState, useRef, useEffect } from "react";
import {
  createTaskAction,
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
  type TaskActionResult,
} from "@/lib/tasks/actions";
import { EmptyState } from "@/components/ui/empty-state";
import type { ClubTask, TaskStatus, TaskPriority, TaskAssignee } from "@/lib/tasks/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClubMember = { userId: string; fullName: string | null; email: string | null };

type TaskPermissions = {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  canAssign: boolean;
  canComplete: boolean;
};

type Props = {
  clubId: string;
  clubName: string;
  currentUserId: string;
  tasks: ClubTask[];
  myTasks: ClubTask[];
  clubMembers: ClubMember[];
  permissions: TaskPermissions;
};

// ─── Status / priority config ─────────────────────────────────────────────────

const STATUS_CONFIG: Record<TaskStatus, { label: string; bg: string; text: string; dot: string }> = {
  todo:        { label: "To Do",       bg: "bg-slate-100",  text: "text-slate-600", dot: "bg-slate-400"  },
  in_progress: { label: "In Progress", bg: "bg-blue-100",   text: "text-blue-700",  dot: "bg-blue-500"   },
  blocked:     { label: "Blocked",     bg: "bg-red-100",    text: "text-red-700",   dot: "bg-red-500"    },
  completed:   { label: "Completed",   bg: "bg-green-100",  text: "text-green-700", dot: "bg-green-500"  },
};

const PRIORITY_CONFIG: Record<TaskPriority, { label: string; bg: string; text: string; border: string }> = {
  low:    { label: "Low",    bg: "bg-slate-100",  text: "text-slate-500",  border: "border-slate-300" },
  medium: { label: "Medium", bg: "bg-blue-100",   text: "text-blue-600",   border: "border-blue-300"  },
  high:   { label: "High",   bg: "bg-amber-100",  text: "text-amber-700",  border: "border-amber-300" },
  urgent: { label: "Urgent", bg: "bg-red-100",    text: "text-red-700",    border: "border-red-400"   },
};

const PRIORITY_LEFT_BORDER: Record<TaskPriority, string> = {
  low:    "border-l-slate-300",
  medium: "border-l-blue-400",
  high:   "border-l-amber-400",
  urgent: "border-l-red-500",
};

// ─── Filter type ──────────────────────────────────────────────────────────────

type FilterStatus = TaskStatus | "all";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function displayName(m: { fullName: string | null; email: string | null } | null): string {
  if (!m) return "Unknown";
  const n = m.fullName?.trim();
  if (n) return n;
  return "Member";
}

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function AssigneeAvatar({ assignee, size = "sm" }: { assignee: TaskAssignee; size?: "sm" | "md" }) {
  const name = displayName(assignee);
  const sizeClass = size === "sm" ? "h-6 w-6 text-[10px]" : "h-7 w-7 text-xs";
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-slate-700 font-semibold text-white ${sizeClass}`}
      title={name}
    >
      {initials(name)}
    </span>
  );
}

// ─── Task Status Badge ────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: TaskStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: TaskPriority }) {
  const cfg = PRIORITY_CONFIG[priority];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

// ─── Task Form (Create & Edit) ────────────────────────────────────────────────

type TaskFormProps = {
  clubId: string;
  clubMembers: ClubMember[];
  permissions: TaskPermissions;
  editTask?: ClubTask;
  onSuccess: () => void;
  onCancel: () => void;
};

function TaskForm({ clubId, clubMembers, permissions, editTask, onSuccess, onCancel }: TaskFormProps) {
  const isEditing = Boolean(editTask);
  const action = isEditing ? updateTaskAction : createTaskAction;

  const [state, formAction, isPending] = useActionState<TaskActionResult, FormData>(action, { ok: true });

  const [selectedAssignees, setSelectedAssignees] = useState<string[]>(
    editTask?.assignees.map((a) => a.userId) ?? [],
  );

  const formRef = useRef<HTMLFormElement>(null);

  // When action succeeds, call onSuccess.
  useEffect(() => {
    if (state.ok && !isPending) {
      // Only clear after a real submit (the initial render also has ok:true).
      if (formRef.current?.dataset.submitted === "true") {
        onSuccess();
        formRef.current.dataset.submitted = "";
      }
    }
  }, [state, isPending, onSuccess]);

  function toggleAssignee(userId: string) {
    setSelectedAssignees((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId],
    );
  }

  return (
    <form
      ref={formRef}
      action={(fd) => {
        if (formRef.current) formRef.current.dataset.submitted = "true";
        fd.set("assignee_ids", JSON.stringify(selectedAssignees));
        formAction(fd);
      }}
      className="space-y-4"
    >
      <input type="hidden" name="club_id" value={clubId} />
      {editTask && <input type="hidden" name="task_id" value={editTask.id} />}

      {/* Title */}
      <div>
        <label htmlFor="task-title" className="mb-1.5 block text-sm font-medium text-slate-700">
          Title <span className="text-red-500">*</span>
        </label>
        <input
          id="task-title"
          name="title"
          type="text"
          required
          defaultValue={editTask?.title}
          className="input-control"
          placeholder="What needs to be done?"
        />
      </div>

      {/* Description */}
      <div>
        <label htmlFor="task-desc" className="mb-1.5 block text-sm font-medium text-slate-700">
          Description
        </label>
        <textarea
          id="task-desc"
          name="description"
          rows={3}
          defaultValue={editTask?.description ?? ""}
          className="textarea-control"
          placeholder="Optional details, context, or instructions…"
        />
      </div>

      {/* Priority + Status row */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="task-priority" className="mb-1.5 block text-sm font-medium text-slate-700">
            Priority
          </label>
          <select
            id="task-priority"
            name="priority"
            defaultValue={editTask?.priority ?? "medium"}
            className="input-control"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </div>

        <div>
          <label htmlFor="task-status" className="mb-1.5 block text-sm font-medium text-slate-700">
            Status
          </label>
          <select
            id="task-status"
            name="status"
            defaultValue={editTask?.status ?? "todo"}
            className="input-control"
          >
            <option value="todo">To Do</option>
            <option value="in_progress">In Progress</option>
            <option value="blocked">Blocked</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Due date */}
      <div>
        <label htmlFor="task-due" className="mb-1.5 block text-sm font-medium text-slate-700">
          Due Date
        </label>
        <input
          id="task-due"
          name="due_at"
          type="datetime-local"
          defaultValue={
            editTask?.dueAtIso
              ? new Date(editTask.dueAtIso).toISOString().slice(0, 16)
              : ""
          }
          className="input-control"
        />
      </div>

      {/* Assignees */}
      {(permissions.canAssign || permissions.canCreate) && clubMembers.length > 0 && (
        <div>
          <p className="mb-2 block text-sm font-medium text-slate-700">Assignees</p>
          <div className="grid gap-1 sm:grid-cols-2">
            {clubMembers.map((member) => {
              const name = displayName(member);
              const checked = selectedAssignees.includes(member.userId);
              return (
                <label
                  key={member.userId}
                  className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2 text-sm transition ${
                    checked
                      ? "border-slate-800 bg-slate-900 text-white"
                      : "border-slate-200 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggleAssignee(member.userId)}
                  />
                  <span
                    className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs ${
                      checked ? "border-white bg-white text-slate-900" : "border-slate-300"
                    }`}
                  >
                    {checked && (
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                  <span className="truncate font-medium">{name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {!state.ok && (
        <p className="alert-error">{(state as { ok: false; error: string }).error}</p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <button type="submit" disabled={isPending} className="btn-primary">
          {isPending ? "Saving…" : isEditing ? "Save Changes" : "Create Task"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary">
          Cancel
        </button>
      </div>
    </form>
  );
}

// ─── Task Card ────────────────────────────────────────────────────────────────

type TaskCardProps = {
  task: ClubTask;
  currentUserId: string;
  permissions: TaskPermissions;
  clubMembers: ClubMember[];
  clubId: string;
  isEditing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onEditSuccess: () => void;
};

function TaskCard({
  task,
  currentUserId,
  permissions,
  clubMembers,
  clubId,
  isEditing,
  onEdit,
  onCancelEdit,
  onEditSuccess,
}: TaskCardProps) {
  const [statusState, statusAction, isStatusPending] = useActionState<TaskActionResult, FormData>(
    updateTaskStatusAction,
    { ok: true },
  );
  const [deleteState, deleteAction, isDeletePending] = useActionState<TaskActionResult, FormData>(
    deleteTaskAction,
    { ok: true },
  );

  const isAssignee = task.assignees.some((a) => a.userId === currentUserId);
  const canChangeStatus = permissions.canEdit || (permissions.canComplete && isAssignee);
  const canComplete = permissions.canEdit || (permissions.canComplete && isAssignee);

  const borderClass = PRIORITY_LEFT_BORDER[task.priority];

  if (isEditing) {
    return (
      <div className={`card-surface border-l-4 p-5 ${borderClass}`}>
        <p className="mb-4 text-sm font-semibold text-slate-900">Edit Task</p>
        <TaskForm
          clubId={clubId}
          clubMembers={clubMembers}
          permissions={permissions}
          editTask={task}
          onSuccess={onEditSuccess}
          onCancel={onCancelEdit}
        />
      </div>
    );
  }

  return (
    <div
      className={`card-surface border-l-4 p-3 transition hover:shadow-md sm:p-4 ${borderClass} ${
        task.status === "completed" ? "opacity-70" : ""
      } max-sm:border max-sm:border-slate-200/90 max-sm:bg-white max-sm:shadow-sm`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <StatusBadge status={task.status} />
            <PriorityBadge priority={task.priority} />
            {task.isOverdue && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700 sm:text-xs">
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Overdue
              </span>
            )}
          </div>
          <h3
            className={`mt-2 text-[15px] font-semibold leading-snug tracking-tight text-slate-900 sm:text-sm ${task.status === "completed" ? "line-through" : ""}`}
          >
            {task.title}
          </h3>
          {task.description && (
            <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">{task.description}</p>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 border-t border-slate-100 pt-3 sm:border-0 sm:pt-0">
          {/* Quick-complete button */}
          {canComplete && task.status !== "completed" && (
            <form
              action={(fd) => {
                fd.set("club_id", clubId);
                fd.set("task_id", task.id);
                fd.set("status", "completed");
                statusAction(fd);
              }}
            >
              <button
                type="submit"
                disabled={isStatusPending}
                title="Mark complete"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-green-500 hover:bg-green-50 hover:text-green-600 sm:h-7 sm:w-7"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
              </button>
            </form>
          )}

          {permissions.canEdit && (
            <button
              type="button"
              onClick={onEdit}
              title="Edit task"
              className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-slate-400 hover:bg-slate-100 hover:text-slate-700 sm:h-7 sm:w-7"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}

          {permissions.canDelete && (
            <form
              action={(fd) => {
                fd.set("club_id", clubId);
                fd.set("task_id", task.id);
                deleteAction(fd);
              }}
            >
              <button
                type="submit"
                disabled={isDeletePending}
                title="Delete task"
                onClick={(e) => {
                  if (!window.confirm("Delete this task? This cannot be undone.")) {
                    e.preventDefault();
                  }
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-400 transition hover:border-red-400 hover:bg-red-50 hover:text-red-600 sm:h-7 sm:w-7"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Assignees */}
          {task.assignees.length > 0 ? (
            <div className="flex -space-x-1">
              {task.assignees.slice(0, 4).map((a) => (
                <AssigneeAvatar key={a.userId} assignee={a} />
              ))}
              {task.assignees.length > 4 && (
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                  +{task.assignees.length - 4}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-400">Unassigned</span>
          )}

          {/* Due date */}
          {task.dueAt && (
            <span className={`flex items-center gap-1 text-xs font-medium ${task.isOverdue ? "text-red-600" : "text-slate-500"}`}>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              {task.dueAt}
            </span>
          )}
        </div>

        {/* Created by */}
        {task.createdByName && (
          <span className="text-xs text-slate-400">by {task.createdByName}</span>
        )}
      </div>

      {/* Status change dropdown (only for users with tasks.edit) */}
      {canChangeStatus && task.status !== "completed" && (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <form
            action={(fd) => {
              fd.set("club_id", clubId);
              fd.set("task_id", task.id);
              statusAction(fd);
            }}
            className="flex flex-col gap-2"
          >
            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500 sm:text-xs sm:normal-case sm:tracking-normal">
              Move to
            </span>
            <div className="flex flex-wrap gap-2">
              {(["todo", "in_progress", "blocked"] as TaskStatus[])
                .filter((s) => s !== task.status)
                .map((s) => {
                  const cfg = STATUS_CONFIG[s];
                  return (
                    <button
                      key={s}
                      type="submit"
                      name="status"
                      value={s}
                      disabled={isStatusPending}
                      className={`min-h-10 rounded-full px-3 py-2 text-xs font-semibold transition hover:opacity-80 sm:min-h-9 ${cfg.bg} ${cfg.text}`}
                    >
                      {cfg.label}
                    </button>
                  );
                })}
            </div>
          </form>
        </div>
      )}

      {!statusState.ok && (
        <p className="mt-2 text-xs text-red-600">{(statusState as { ok: false; error: string }).error}</p>
      )}
      {!deleteState.ok && (
        <p className="mt-2 text-xs text-red-600">{(deleteState as { ok: false; error: string }).error}</p>
      )}
    </div>
  );
}

// ─── Main section component ───────────────────────────────────────────────────

export function ClubTasksSection({
  clubId,
  clubName,
  currentUserId,
  tasks,
  myTasks,
  clubMembers,
  permissions,
}: Props) {
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [filterAssigneeMe, setFilterAssigneeMe] = useState(false);
  const [search, setSearch] = useState("");

  // Derived stats.
  const total = tasks.length;
  const openCount = tasks.filter((t) => t.status !== "completed").length;
  const overdueCount = tasks.filter((t) => t.isOverdue).length;
  const completedCount = tasks.filter((t) => t.status === "completed").length;

  // Client-side filtering.
  const filteredTasks = tasks.filter((t) => {
    if (filterStatus !== "all" && t.status !== filterStatus) return false;
    if (filterAssigneeMe && !t.assignees.some((a) => a.userId === currentUserId)) return false;
    if (search && !t.title.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const filterTabs: { label: string; value: FilterStatus; count?: number }[] = [
    { label: "All", value: "all", count: total },
    { label: "To Do", value: "todo" },
    { label: "In Progress", value: "in_progress" },
    { label: "Blocked", value: "blocked" },
    { label: "Completed", value: "completed", count: completedCount },
  ];

  return (
    <section className="page-sections">

      <header className="card-surface border border-slate-200/90 bg-gradient-to-br from-slate-50 to-emerald-50/80 p-4 shadow-sm sm:p-6 lg:border-2 lg:p-8 lg:shadow-[var(--shadow-soft)]">
        <div className="max-w-4xl">
          <h1 className="section-title text-xl sm:text-3xl md:text-4xl">Tasks</h1>

          {/* Stats row */}
          <div className="mt-4 grid grid-cols-2 gap-2.5 sm:mt-6 sm:grid-cols-4 lg:mt-8">
            <div className="rounded-lg border border-slate-200/90 bg-white/85 px-3 py-2.5">
              <p className="text-xl font-bold text-slate-900 sm:text-2xl">{total}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Total</p>
            </div>
            <div className="rounded-lg border border-slate-200/90 bg-white/85 px-3 py-2.5">
              <p className="text-xl font-bold text-slate-900 sm:text-2xl">{openCount}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">Open</p>
            </div>
            <div className="rounded-lg border border-red-200/80 bg-red-50/70 px-3 py-2.5">
              <p className="text-xl font-bold text-red-700 sm:text-2xl">{overdueCount}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-red-600">Overdue</p>
            </div>
            <div className="rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-2.5">
              <p className="text-xl font-bold text-emerald-700 sm:text-2xl">{myTasks.length}</p>
              <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.1em] text-emerald-600">Mine</p>
            </div>
          </div>

          {permissions.canCreate && (
            <div className="mt-4 sm:mt-6 lg:mt-8">
              <button
                type="button"
                onClick={() => setShowCreateForm(true)}
                className="btn-primary w-full px-6 py-3 text-base font-semibold sm:w-auto"
              >
                + Add Task
              </button>
            </div>
          )}
        </div>
      </header>

      {/* ── Create task form ─────────────────────────────────────────────── */}
      {showCreateForm && (
        <div className="card-surface p-4 sm:p-6">
          <div className="section-card-header">
            <div>
              <p className="section-kicker">New</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">Create Task</h2>
              <p className="mt-1 text-sm text-slate-600">
                Define the task, set a due date, and assign it to one or more members.
              </p>
            </div>
          </div>
          <div className="mt-5">
            <TaskForm
              clubId={clubId}
              clubMembers={clubMembers}
              permissions={permissions}
              onSuccess={() => setShowCreateForm(false)}
              onCancel={() => setShowCreateForm(false)}
            />
          </div>
        </div>
      )}

      {/* ── My Tasks ─────────────────────────────────────────────────────── */}
      {myTasks.length > 0 && !filterAssigneeMe && (
        <div className="card-surface p-4 sm:p-5">
          <div className="section-card-header">
            <div>
              <p className="section-kicker">Personal</p>
              <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900">My Open Tasks</h2>
              <p className="mt-1 text-sm text-slate-600">Tasks assigned to you that are not yet complete.</p>
            </div>
            <span className="badge-soft">{myTasks.length}</span>
          </div>
          <div className="list-stack mt-4 space-y-3">
            {myTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                currentUserId={currentUserId}
                permissions={permissions}
                clubMembers={clubMembers}
                clubId={clubId}
                isEditing={editingTaskId === task.id}
                onEdit={() => setEditingTaskId(task.id)}
                onCancelEdit={() => setEditingTaskId(null)}
                onEditSuccess={() => setEditingTaskId(null)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── All tasks section ─────────────────────────────────────────────── */}
      <div className="card-surface p-4 sm:p-5">
        <div className="section-card-header">
          <div>
            <p className="section-kicker">All Tasks</p>
            <h2 className="mt-1 text-base font-semibold tracking-tight text-slate-900 sm:text-lg">{clubName} tasks</h2>
          </div>
          <span className="badge-soft">{filteredTasks.length}</span>
        </div>

        {/* Filters */}
        <div className="mt-4 space-y-3">
          {/* Status filter tabs */}
          <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden">
            {filterTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setFilterStatus(tab.value)}
                className={`shrink-0 min-h-10 rounded-lg px-3 py-2 text-xs font-semibold transition sm:min-h-0 sm:py-1.5 ${
                  filterStatus === tab.value
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                {tab.label}
                {tab.count !== undefined && (
                  <span className={`ml-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${filterStatus === tab.value ? "bg-white/20 text-white" : "bg-slate-200 text-slate-500"}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Assignee + search row */}
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <button
              type="button"
              onClick={() => setFilterAssigneeMe((v) => !v)}
              className={`flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition sm:w-auto sm:min-h-0 sm:py-1.5 ${
                filterAssigneeMe
                  ? "bg-emerald-700 text-white"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Assigned to me
            </button>

            {overdueCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  setFilterStatus("all");
                  setFilterAssigneeMe(false);
                  setSearch("");
                  // We'll highlight overdue via the card, not a separate filter
                }}
                className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-lg bg-red-100 px-3 py-2 text-xs font-semibold text-red-700 transition hover:bg-red-200 sm:w-auto sm:min-h-0 sm:py-1.5"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {overdueCount} overdue
              </button>
            )}

            <div className="relative w-full sm:ml-auto sm:w-56 md:w-64">
              <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search tasks…"
                className="min-h-10 w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-700 placeholder-slate-400 focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 sm:h-8 sm:min-h-0 sm:py-0 sm:text-xs"
              />
            </div>
          </div>
        </div>

        {/* Task list */}
        <div className="mt-5 space-y-3">
          {filteredTasks.length === 0 ? (
            tasks.length === 0 ? (
              <EmptyState
                icon="ti-checkbox"
                title="No tasks yet"
                description={
                  permissions.canCreate
                    ? "Add an assignment so members know what to work on."
                    : "Assignments and to-dos for this club show up here."
                }
                action={
                  permissions.canCreate
                    ? { label: "Create task", onClick: () => setShowCreateForm(true) }
                    : undefined
                }
              />
            ) : (
              <div className="rounded-xl border border-dashed border-slate-200 px-6 py-12 text-center">
                <p className="text-sm font-semibold text-slate-700">No tasks match your filters</p>
                <p className="mt-1 text-xs text-slate-500">Try adjusting the status filter or search term.</p>
              </div>
            )
          ) : (
            filteredTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                currentUserId={currentUserId}
                permissions={permissions}
                clubMembers={clubMembers}
                clubId={clubId}
                isEditing={editingTaskId === task.id}
                onEdit={() => setEditingTaskId(task.id)}
                onCancelEdit={() => setEditingTaskId(null)}
                onEditSuccess={() => setEditingTaskId(null)}
              />
            ))
          )}
        </div>
      </div>
    </section>
  );
}
