// src/lib/materialStatus.ts
// One place for every material status and which admin tab shows it.
import type { MaterialStatus } from '@/lib/firestore/materials';

export const MATERIAL_STATUS = {
  UPLOAD_REVIEW: 'upload_review',
  SORTED: 'sorted',
  PROCESSING: 'processing',
  OCR_PENDING: 'ocr_pending',
  OCR_FAILED: 'ocr_failed',
  PENDING_REVIEW: 'pending_review',
  APPROVED: 'approved',
  QUARANTINED: 'quarantined',
  REJECTED: 'rejected',
} as const;

// Admin tab that lists a material with this status (null = not shown in a tab).
export function tabForStatus(status: MaterialStatus | string | undefined): string | null {
  switch (status) {
    case MATERIAL_STATUS.UPLOAD_REVIEW: return 'uploads';
    case MATERIAL_STATUS.SORTED:
    case MATERIAL_STATUS.PROCESSING: return 'ocrqueue';
    case MATERIAL_STATUS.PENDING_REVIEW: return 'pending';
    case MATERIAL_STATUS.OCR_PENDING:
    case MATERIAL_STATUS.OCR_FAILED:
    case MATERIAL_STATUS.REJECTED: return 'resurrection';
    case MATERIAL_STATUS.APPROVED: return 'approved';
    case MATERIAL_STATUS.QUARANTINED: return 'quarantined';
    default: return null;
  }
}
