-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('CREDIT', 'DEBIT');

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" VARCHAR(100) NOT NULL,
    "balance" DECIMAL(19,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "account_id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "reference_id" VARCHAR(120) NOT NULL,
    "transfer_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transfers" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "from_account_id" UUID NOT NULL,
    "to_account_id" UUID NOT NULL,
    "amount" DECIMAL(19,2) NOT NULL,
    "description" VARCHAR(255) NOT NULL DEFAULT '',
    "reference_id" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounts_created_at_id_idx" ON "accounts"("created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "transactions_account_id_created_at_id_idx" ON "transactions"("account_id", "created_at" DESC, "id" DESC);

-- CreateIndex
CREATE INDEX "transactions_transfer_id_idx" ON "transactions"("transfer_id");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_account_id_reference_id_key" ON "transactions"("account_id", "reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "transfers_reference_id_key" ON "transfers"("reference_id");

-- CreateIndex
CREATE INDEX "transfers_from_account_id_idx" ON "transfers"("from_account_id");

-- CreateIndex
CREATE INDEX "transfers_to_account_id_idx" ON "transfers"("to_account_id");

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_account_id_fkey" FOREIGN KEY ("account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "transfers"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_account_id_fkey" FOREIGN KEY ("from_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_account_id_fkey" FOREIGN KEY ("to_account_id") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- ---------------------------------------------------------------------------
-- Hand-written integrity rules (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------

-- Balances can never be negative, regardless of what the application does.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_balance_non_negative" CHECK ("balance" >= 0);

-- Account names must contain at least one non-whitespace character.
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_name_not_blank" CHECK (length(btrim("name")) > 0);

-- Ledger entries always move a positive amount; direction comes from "type".
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reference_id_not_blank" CHECK (length(btrim("reference_id")) > 0);

ALTER TABLE "transfers" ADD CONSTRAINT "transfers_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_distinct_accounts" CHECK ("from_account_id" <> "to_account_id");
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reference_id_not_blank" CHECK (length(btrim("reference_id")) > 0);

-- Ledger tables are append-only. Corrections must be made with compensating
-- entries, so any UPDATE or DELETE is rejected at the database level.
-- (TRUNCATE is deliberately not blocked so test suites can reset the database.)
CREATE FUNCTION "reject_ledger_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% rows are immutable; % is not permitted', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "transactions_immutable"
  BEFORE UPDATE OR DELETE ON "transactions"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_mutation"();

CREATE TRIGGER "transfers_immutable"
  BEFORE UPDATE OR DELETE ON "transfers"
  FOR EACH ROW EXECUTE FUNCTION "reject_ledger_mutation"();
