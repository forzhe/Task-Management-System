import type {
  Companion,
  CompanionAction,
  Goal,
  NexusEvent,
  Profile,
  Review,
  Task,
  TaskStatus,
  TaskStatusUpdateEvidence,
} from "@nexus/shared";

export interface NexusTools {
  getUserProfile(): Profile;
  queryEvents(limit?: number): NexusEvent[];
  searchMemory(query: string, topK: number): NexusEvent[];
  getActiveGoals(): Goal[];
  getCurrentTasks(): Task[];
  logEvent(event: Parameters<NexusTools["unsafeLogEvent"]>[0]): NexusEvent;
  unsafeLogEvent(
    event: Omit<NexusEvent, "id" | "userId" | "ingestedAt"> & Partial<NexusEvent>,
  ): NexusEvent;
  createTask(task: Pick<Task, "title"> & Partial<Task>): Task;
  createGoal(goal: Pick<Goal, "title" | "level"> & Partial<Goal>): Goal;
  updateTaskStatus(taskId: string, status: TaskStatus, evidence?: TaskStatusUpdateEvidence): Task;
  saveReview(review: Omit<Review, "id" | "userId" | "createdAt"> & Partial<Review>): Review;
  getReview(reviewId: string): Review | null;
  triggerCompanion(action: CompanionAction): Companion;
  getCompanion(): Companion;
}
