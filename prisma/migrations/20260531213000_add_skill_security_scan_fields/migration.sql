ALTER TABLE "Skill" ADD COLUMN "securityScanProvider" TEXT;
ALTER TABLE "Skill" ADD COLUMN "securityRiskScore" DOUBLE PRECISION;
ALTER TABLE "Skill" ADD COLUMN "securityRiskSeverity" TEXT;
ALTER TABLE "Skill" ADD COLUMN "securityRecommendation" TEXT;
ALTER TABLE "Skill" ADD COLUMN "securityFindingCount" INTEGER;
ALTER TABLE "Skill" ADD COLUMN "securityScannedAt" TIMESTAMP(3);
