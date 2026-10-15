export const DATA_POLICY_VERSION = '2026-10'

export function dataPolicyAcceptance(now = new Date()) {
  return {
    data_policy_accepted_at: now,
    data_policy_version: DATA_POLICY_VERSION,
  }
}

export function isDataPolicyPending(version?: string | null) {
  return version !== DATA_POLICY_VERSION
}
