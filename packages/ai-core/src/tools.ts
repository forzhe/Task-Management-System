import type {
  CalendarEvent,
  Companion,
  CompanionAction,
  CompanionMemory,
  CompanionMemoryType,
  Goal,
  GoalStatus,
  NexusEvent,
  Profile,
  ProfileChangeProposal,
  ProfileFieldPath,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
  UserStreak,
} from "@nexus/shared";

export interface NexusTools {
  getUserProfile(): Profile;
  queryEvents(limit?: number): NexusEvent[];
  searchMemory(query: string, topK: number): NexusEvent[];
  getActiveGoals(): Goal[];
  getCurrentTasks(): Task[];
  /** §6.7 今日日历事件（晨间规划上下文 + 复盘客观锚点）*/
  getTodayCalendar(): CalendarEvent[];
  logEvent(event: Parameters<NexusTools["unsafeLogEvent"]>[0]): NexusEvent;
  unsafeLogEvent(
    event: Omit<NexusEvent, "id" | "userId" | "ingestedAt"> & Partial<NexusEvent>,
  ): NexusEvent;
  createTask(task: Pick<Task, "title"> & Partial<Task>): Task;
  createGoal(goal: Pick<Goal, "title" | "level"> & Partial<Goal>): Goal;
  updateGoalStatus(goalId: string, status: GoalStatus): Goal;
  updateProfile(delta: Partial<Omit<Profile, "userId" | "updatedAt" | "version">>): Profile;
  updateTaskStatus(taskId: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence): Task;
  saveReview(review: Omit<Review, "id" | "userId" | "createdAt"> & Partial<Review>): Review;
  getReview(reviewId: string): Review | null;
  triggerCompanion(action: CompanionAction): Companion;
  getCompanion(): Companion;
  // ── 持续力引擎 §6.6 ──
  listStreaks(): UserStreak[];
  saveCompanionMemory(input: {
    type: CompanionMemoryType;
    summary: string;
    refEventIds?: string[];
    emotionalWeight?: number;
  }): CompanionMemory;
  getCompanionMemories(): CompanionMemory[];
  // ── 档案演化 §5.3 ──
  saveProfileChangeProposal(input: {
    field: ProfileFieldPath;
    subPath?: string | null;
    currentValue?: unknown;
    proposedValue: unknown;
    reason: string;
    confidence?: number;
  }): ProfileChangeProposal;
}
