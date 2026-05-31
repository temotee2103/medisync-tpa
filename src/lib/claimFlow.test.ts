import assert from "node:assert/strict";
import { normalizeClaimStatus, CLAIM_STATUS } from "@/lib/claimFlow";

assert.equal(normalizeClaimStatus("submitted"), CLAIM_STATUS.SUBMITTED);
assert.equal(normalizeClaimStatus("in_review"), CLAIM_STATUS.SUBMITTED);
assert.equal(normalizeClaimStatus("in_progress"), CLAIM_STATUS.IN_PROCESS);
assert.equal(normalizeClaimStatus("listed"), CLAIM_STATUS.APPROVED);
assert.equal(normalizeClaimStatus("paid"), CLAIM_STATUS.APPROVED);
assert.equal(normalizeClaimStatus("pv_uploaded"), CLAIM_STATUS.APPROVED);
assert.equal(normalizeClaimStatus("request_additional_information"), CLAIM_STATUS.MORE_INFORMATION);
assert.equal(normalizeClaimStatus("more_information"), CLAIM_STATUS.MORE_INFORMATION);
assert.equal(normalizeClaimStatus("draft"), CLAIM_STATUS.DRAFT);
assert.equal(normalizeClaimStatus("rejected"), CLAIM_STATUS.REJECTED);
assert.equal(normalizeClaimStatus("in_process"), CLAIM_STATUS.IN_PROCESS);
assert.equal(normalizeClaimStatus("approved"), CLAIM_STATUS.APPROVED);
assert.equal(normalizeClaimStatus(""), null);
assert.equal(normalizeClaimStatus(null), null);
assert.equal(normalizeClaimStatus(undefined), null);
