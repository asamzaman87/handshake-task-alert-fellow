export type AlertStatus =
  | "queued"
  | "calling"
  | "answered"
  | "unresolved"
  | "failed";

export interface AlertRecord {
  alertId: string;
  phoneNumber: string;
  customMessage: string;
  status: AlertStatus;
  createdAt: string;
  startedAt: string;
  endedAt?: string;
  lastCallSid?: string;
  attempts: number;
  answeredAt?: string;
  failureReason?: string;
}

export interface StartAlertPayload {
  alertId: string;
  phoneNumber: string;
  message?: string;
}
