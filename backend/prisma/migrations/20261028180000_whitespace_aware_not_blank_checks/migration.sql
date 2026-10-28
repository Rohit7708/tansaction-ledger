-- btrim() only strips spaces, so values such as E'\t\n' passed the original
-- "not blank" checks. Require at least one non-whitespace character instead.
ALTER TABLE "accounts" DROP CONSTRAINT "accounts_name_not_blank";
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_name_not_blank" CHECK ("name" ~ '[^[:space:]]');

ALTER TABLE "transactions" DROP CONSTRAINT "transactions_reference_id_not_blank";
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_reference_id_not_blank" CHECK ("reference_id" ~ '[^[:space:]]');

ALTER TABLE "transfers" DROP CONSTRAINT "transfers_reference_id_not_blank";
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_reference_id_not_blank" CHECK ("reference_id" ~ '[^[:space:]]');
