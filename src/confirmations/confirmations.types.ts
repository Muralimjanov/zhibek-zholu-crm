import { PendingActionStatus, PendingActionType } from '@prisma/client';

export type EmailDeliveryStatus = 'sent' | 'failed' | 'no_recipients';

export class PendingActionSummaryDto {
  id!: string;
  type!: PendingActionType;
  status!: PendingActionStatus;
  expiresAt!: Date;
  createdAt!: Date;
  initiatorUserId!: string;
  /** Human-readable, non-sensitive hint of what is being approved. */
  summary!: string;
}

export interface InitiateResult {
  pendingActionId: string;
  type: PendingActionType;
  status: PendingActionStatus;
  expiresAt: Date;
  emailDelivery: EmailDeliveryStatus;
}
