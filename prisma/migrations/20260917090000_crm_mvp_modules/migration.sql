-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('active', 'converted', 'cancelled');

-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('draft', 'deposit_paid', 'signed');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed', 'missed');

-- CreateEnum
CREATE TYPE "PayrollEntryStatus" AS ENUM ('draft', 'confirmed');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('income', 'expense');

-- CreateEnum
CREATE TYPE "TransactionCategory" AS ENUM ('sale_deposit', 'sale_full_payment', 'sale_installment', 'other_income', 'construction_materials', 'contractor_payment', 'payroll', 'equipment_rent', 'utilities', 'marketing', 'legal_notary', 'taxes_corporate', 'admin_office', 'other_expense');

-- CreateEnum
CREATE TYPE "DailyReportType" AS ENUM ('financial', 'sales');

-- CreateEnum
CREATE TYPE "StoredFilePurpose" AS ENUM ('avatar', 'contract_document', 'transaction_attachment');

-- AlterEnum
ALTER TYPE "ConsentPolicyType" ADD VALUE 'personal_data_processing';

-- AlterTable
-- Safety: never silently discard data. avatarUrl is replaced by an uploaded,
-- access-controlled avatar file; abort if any row still holds a value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "User" WHERE "avatarUrl" IS NOT NULL) THEN
    RAISE EXCEPTION 'User.avatarUrl contains data - migrate it before dropping the column';
  END IF;
END $$;

ALTER TABLE "User" DROP COLUMN "avatarUrl",
ADD COLUMN     "avatarFileId" TEXT,
ADD COLUMN     "teamLeadId" TEXT;

-- CreateTable
CREATE TABLE "StoredFile" (
    "id" TEXT NOT NULL,
    "purpose" "StoredFilePurpose" NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "originalNameEnc" TEXT,
    "keyVersion" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StoredFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Booking" (
    "id" TEXT NOT NULL,
    "fullNameEnc" TEXT NOT NULL,
    "passportNumberEnc" TEXT NOT NULL,
    "passportNumberIdx" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "phoneIdx" TEXT NOT NULL,
    "emailEnc" TEXT,
    "desiredAreaSqm" DECIMAL(12,2) NOT NULL,
    "status" "BookingStatus" NOT NULL DEFAULT 'active',
    "managerId" TEXT NOT NULL,
    "buyerConsentVersion" TEXT NOT NULL,
    "buyerConsentConfirmedAt" TIMESTAMP(3) NOT NULL,
    "buyerConsentRecordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Booking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT,
    "fullNameEnc" TEXT NOT NULL,
    "passportNumberEnc" TEXT NOT NULL,
    "passportNumberIdx" TEXT NOT NULL,
    "addressEnc" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "phoneIdx" TEXT NOT NULL,
    "emailEnc" TEXT,
    "areaSqm" DECIMAL(12,2) NOT NULL,
    "pricePerSqmTyiyn" BIGINT NOT NULL,
    "totalAmountTyiyn" BIGINT NOT NULL,
    "depositPercent" DECIMAL(5,2) NOT NULL DEFAULT 30,
    "depositAmountTyiyn" BIGINT NOT NULL,
    "depositPaid" BOOLEAN NOT NULL DEFAULT false,
    "depositPaidAt" TIMESTAMP(3),
    "depositMarkedById" TEXT,
    "contractFileId" TEXT,
    "status" "ContractStatus" NOT NULL DEFAULT 'draft',
    "managerId" TEXT NOT NULL,
    "buyerConsentVersion" TEXT NOT NULL,
    "buyerConsentConfirmedAt" TIMESTAMP(3) NOT NULL,
    "buyerConsentRecordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "status" "ShiftStatus" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DayOff" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "approvedById" TEXT NOT NULL,
    "reasonEnc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DayOff_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollSettings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "finePerMissedShiftTyiyn" BIGINT NOT NULL,
    "taxRatePercent" DECIMAL(5,2) NOT NULL,
    "updatedById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayrollEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "baseSalaryTyiyn" BIGINT NOT NULL,
    "missedShiftsCount" INTEGER NOT NULL,
    "fineAmountTyiyn" BIGINT NOT NULL,
    "fineManuallyAdjusted" BOOLEAN NOT NULL DEFAULT false,
    "taxRatePercent" DECIMAL(5,2) NOT NULL,
    "finePerMissedShiftTyiyn" BIGINT NOT NULL,
    "taxAmountTyiyn" BIGINT NOT NULL,
    "finalAmountTyiyn" BIGINT NOT NULL,
    "status" "PayrollEntryStatus" NOT NULL DEFAULT 'draft',
    "confirmedById" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "category" "TransactionCategory" NOT NULL,
    "subcategory" TEXT,
    "amountTyiyn" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'KGS',
    "date" DATE NOT NULL,
    "commentEnc" TEXT,
    "attachmentFileId" TEXT,
    "relatedContractId" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingPeriod" (
    "period" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedById" TEXT NOT NULL,

    CONSTRAINT "AccountingPeriod_pkey" PRIMARY KEY ("period")
);

-- CreateTable
CREATE TABLE "DailyReport" (
    "id" TEXT NOT NULL,
    "type" "DailyReportType" NOT NULL,
    "date" DATE NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "contentEnc" TEXT NOT NULL,
    "sourceShiftId" TEXT,

    CONSTRAINT "DailyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StoredFile_storageKey_key" ON "StoredFile"("storageKey");

-- CreateIndex
CREATE INDEX "StoredFile_uploadedById_idx" ON "StoredFile"("uploadedById");

-- CreateIndex
CREATE INDEX "Booking_managerId_idx" ON "Booking"("managerId");

-- CreateIndex
CREATE INDEX "Booking_status_idx" ON "Booking"("status");

-- CreateIndex
CREATE INDEX "Booking_passportNumberIdx_idx" ON "Booking"("passportNumberIdx");

-- CreateIndex
CREATE INDEX "Booking_phoneIdx_idx" ON "Booking"("phoneIdx");

-- CreateIndex
CREATE INDEX "Booking_createdAt_idx" ON "Booking"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_bookingId_key" ON "Contract"("bookingId");

-- CreateIndex
CREATE UNIQUE INDEX "Contract_contractFileId_key" ON "Contract"("contractFileId");

-- CreateIndex
CREATE INDEX "Contract_managerId_idx" ON "Contract"("managerId");

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");

-- CreateIndex
CREATE INDEX "Contract_passportNumberIdx_idx" ON "Contract"("passportNumberIdx");

-- CreateIndex
CREATE INDEX "Contract_phoneIdx_idx" ON "Contract"("phoneIdx");

-- CreateIndex
CREATE INDEX "Contract_createdAt_idx" ON "Contract"("createdAt");

-- CreateIndex
CREATE INDEX "Contract_depositPaidAt_idx" ON "Contract"("depositPaidAt");

-- CreateIndex
CREATE INDEX "Shift_date_idx" ON "Shift"("date");

-- CreateIndex
CREATE INDEX "Shift_status_idx" ON "Shift"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_userId_date_key" ON "Shift"("userId", "date");

-- CreateIndex
CREATE INDEX "DayOff_date_idx" ON "DayOff"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DayOff_userId_date_key" ON "DayOff"("userId", "date");

-- CreateIndex
CREATE INDEX "PayrollEntry_period_idx" ON "PayrollEntry"("period");

-- CreateIndex
CREATE INDEX "PayrollEntry_status_idx" ON "PayrollEntry"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PayrollEntry_userId_period_key" ON "PayrollEntry"("userId", "period");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_attachmentFileId_key" ON "Transaction"("attachmentFileId");

-- CreateIndex
CREATE INDEX "Transaction_date_idx" ON "Transaction"("date");

-- CreateIndex
CREATE INDEX "Transaction_type_category_idx" ON "Transaction"("type", "category");

-- CreateIndex
CREATE INDEX "Transaction_relatedContractId_idx" ON "Transaction"("relatedContractId");

-- CreateIndex
CREATE INDEX "Transaction_createdById_idx" ON "Transaction"("createdById");

-- CreateIndex
CREATE INDEX "DailyReport_date_idx" ON "DailyReport"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyReport_type_date_key" ON "DailyReport"("type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "User_avatarFileId_key" ON "User"("avatarFileId");

-- CreateIndex
CREATE INDEX "User_teamLeadId_idx" ON "User"("teamLeadId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_avatarFileId_fkey" FOREIGN KEY ("avatarFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_teamLeadId_fkey" FOREIGN KEY ("teamLeadId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_contractFileId_fkey" FOREIGN KEY ("contractFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOff" ADD CONSTRAINT "DayOff_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DayOff" ADD CONSTRAINT "DayOff_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_attachmentFileId_fkey" FOREIGN KEY ("attachmentFileId") REFERENCES "StoredFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_relatedContractId_fkey" FOREIGN KEY ("relatedContractId") REFERENCES "Contract"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DailyReport" ADD CONSTRAINT "DailyReport_sourceShiftId_fkey" FOREIGN KEY ("sourceShiftId") REFERENCES "Shift"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Defense-in-depth CHECK constraints (not expressible in Prisma schema).
-- ---------------------------------------------------------------------------
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_desiredAreaSqm_positive" CHECK ("desiredAreaSqm" > 0);

ALTER TABLE "Contract" ADD CONSTRAINT "Contract_areaSqm_positive" CHECK ("areaSqm" > 0);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_money_non_negative" CHECK ("pricePerSqmTyiyn" >= 0 AND "totalAmountTyiyn" >= 0 AND "depositAmountTyiyn" >= 0);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_depositPercent_range" CHECK ("depositPercent" >= 0 AND "depositPercent" <= 100);
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_signed_requires_deposit_and_file" CHECK ("status" <> 'signed' OR ("depositPaid" AND "contractFileId" IS NOT NULL));
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_deposit_paid_status" CHECK ("status" = 'draft' OR "depositPaid");

ALTER TABLE "Shift" ADD CONSTRAINT "Shift_status_timestamps" CHECK (
  ("status" = 'missed' AND "openedAt" IS NULL AND "closedAt" IS NULL) OR
  ("status" = 'open' AND "openedAt" IS NOT NULL AND "closedAt" IS NULL) OR
  ("status" = 'closed' AND "openedAt" IS NOT NULL AND "closedAt" IS NOT NULL AND "closedAt" >= "openedAt")
);

ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_singleton" CHECK ("id" = 1);
ALTER TABLE "PayrollSettings" ADD CONSTRAINT "PayrollSettings_ranges" CHECK ("finePerMissedShiftTyiyn" >= 0 AND "taxRatePercent" >= 0 AND "taxRatePercent" <= 100);

ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_non_negative" CHECK ("baseSalaryTyiyn" >= 0 AND "missedShiftsCount" >= 0 AND "fineAmountTyiyn" >= 0 AND "taxAmountTyiyn" >= 0);
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_final_formula" CHECK ("finalAmountTyiyn" = "baseSalaryTyiyn" - "fineAmountTyiyn" - "taxAmountTyiyn");
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_confirmed_metadata" CHECK ("status" = 'draft' OR ("confirmedById" IS NOT NULL AND "confirmedAt" IS NOT NULL));

ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amountTyiyn" > 0);
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_currency_kgs" CHECK ("currency" = 'KGS');
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_type_category" CHECK (
  ("type" = 'income' AND "category" IN ('sale_deposit', 'sale_full_payment', 'sale_installment', 'other_income')) OR
  ("type" = 'expense' AND "category" NOT IN ('sale_deposit', 'sale_full_payment', 'sale_installment', 'other_income'))
);

ALTER TABLE "AccountingPeriod" ADD CONSTRAINT "AccountingPeriod_period_format" CHECK ("period" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

ALTER TABLE "StoredFile" ADD CONSTRAINT "StoredFile_size_positive" CHECK ("sizeBytes" > 0);

-- Existing sales managers belong to the head of sales who created them.
UPDATE "User" u SET "teamLeadId" = u."createdById"
FROM "User" c
WHERE u."role" = 'sales_manager' AND u."teamLeadId" IS NULL AND c."id" = u."createdById" AND c."role" = 'head_of_sales';
