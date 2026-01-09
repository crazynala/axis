-- Add explicit defect actions for logged vs reconciled losses
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'DEFECT_LOGGED';
ALTER TYPE "ActivityAction" ADD VALUE IF NOT EXISTS 'LOSS_RECONCILED';
