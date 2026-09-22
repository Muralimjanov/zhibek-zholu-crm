-- Лиды: обращения, зарегистрированные ресепшеном. Первый шаг воронки
-- лид -> бронь -> договор.
CREATE TYPE "LeadStatus" AS ENUM ('new', 'assigned', 'converted', 'rejected');

CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "firstNameEnc" TEXT NOT NULL,
    "lastNameEnc" TEXT NOT NULL,
    "phoneEnc" TEXT NOT NULL,
    "phoneIdx" TEXT NOT NULL,
    "commentEnc" TEXT,
    "desiredAreaSqm" DECIMAL(12,2) NOT NULL,
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "createdById" TEXT NOT NULL,
    "assignedManagerId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "buyerConsentVersion" TEXT NOT NULL,
    "buyerConsentConfirmedAt" TIMESTAMP(3) NOT NULL,
    "buyerConsentRecordedById" TEXT NOT NULL,
    "bookingId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lead_bookingId_key" ON "Lead"("bookingId");
CREATE INDEX "Lead_status_idx" ON "Lead"("status");
CREATE INDEX "Lead_assignedManagerId_idx" ON "Lead"("assignedManagerId");
CREATE INDEX "Lead_createdById_idx" ON "Lead"("createdById");
CREATE INDEX "Lead_phoneIdx_idx" ON "Lead"("phoneIdx");
CREATE INDEX "Lead_createdAt_idx" ON "Lead"("createdAt");

ALTER TABLE "Lead" ADD CONSTRAINT "Lead_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_assignedManagerId_fkey"
    FOREIGN KEY ("assignedManagerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "Booking"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Площадь всегда положительная: ноль квадратных метров смысла не имеет.
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_desiredAreaSqm_positive" CHECK ("desiredAreaSqm" > 0);
-- Превращённый лид обязан ссылаться на бронь, непревращённый — не может.
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_converted_has_booking"
    CHECK (("status" = 'converted') = ("bookingId" IS NOT NULL));
