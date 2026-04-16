export type LastPollStatus = "idle" | "ok" | "error" | "session_expired";
export type AlertLifecycleState =
  | "IDLE"
  | "TASK_AVAILABLE_NEW"
  | "ALERT_ACTIVE"
  | "ALERT_ANSWERED"
  | "ALERT_UNANSWERED_WAITING_RETRY"
  | "RETRY_DUE_CHECKING_TASKS"
  | "RESOLVED";

export interface AlertState {
  alertId: string;
  state: AlertLifecycleState;
  createdAt: string;
  retryScheduled: boolean;
  retryAttempted: boolean;
}

export interface ExtensionState {
  enabled: boolean;
  lastPollAt: string | null;
  lastPollStatus: LastPollStatus;
  lastAvailableCount: number;
  lastError: string | null;
  activeAlert: AlertState | null;
  lastAlertStartedAt: string | null;
  lastAlertResolvedAt: string | null;
  lastRetryScheduledAt: string | null;
  activeAvailabilityKey: string | null;
}

export interface PollResult {
  availableCount: number;
  rawSnippet: string;
}
