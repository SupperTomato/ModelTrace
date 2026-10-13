import { isMismatch, record } from './state.mjs';

// A candidate mismatch is not automatically a strong difference signal. Keep both
// visible, with different wording, instead of silently discarding weak evidence.
export function queueAlert(state, sample) {
  if (!isMismatch(sample)) return null;
  state.alerts ||= [];
  const existing = state.alerts.find((alert) => alert.id === sample.challenge);
  if (existing) return existing;
  const level = ['difference_signal', 'repeated_difference'].includes(sample.outcome) ? sample.outcome : 'candidate_mismatch';
  const alert = {
    id: sample.challenge, at: sample.at, epoch: sample.epoch, level,
    expected: sample.expected, prediction: sample.prediction, reportedModel: sample.reportedModel,
    language: sample.language, closedSetWeight: sample.closedSetWeight, expectedWeight: sample.expectedWeight,
    acknowledgedAt: null, deliveryCount: 0, lastDeliveredAt: null, lastDeliveryTurn: null,
  };
  state.alerts.push(alert);
  record(state, 'model_mismatch_alert', sample.at, { alert: alert.id, level, expected: alert.expected, prediction: alert.prediction });
  return alert;
}

export const pendingAlerts = (state) => (state?.alerts || []).filter((alert) => !alert.acknowledgedAt);

export function userNotice(alert) {
  if (alert.level === 'confirmed_mismatch') return `ModelTrace Guard: all ${alert.retryCount} additional retries mismatched expected model ${JSON.stringify(alert.expected)}. Leading retry candidates: ${JSON.stringify(alert.predictions || [alert.prediction])}. The agent must immediately stop the original task, notify the user, and wait for a decision.`;
  const strength = { candidate_mismatch: 'Insufficient evidence: candidate ranking differs', difference_signal: 'One stronger fingerprint difference signal', repeated_difference: 'Repeated recent fingerprint differences in the same language' }[alert.level];
  return `ModelTrace Guard Alerts: ${new Date(alert.at).toISOString()}; expected ${JSON.stringify(alert.expected)}; leading fingerprint candidate ${JSON.stringify(alert.prediction)} (${strength}). These experimental results have not been independently calibrated and cannot confirm model replacement, reduced capability, or provider cheating. Later compatible samples do not erase this record.`;
}

export function acknowledgeAlerts(state, ids, now) {
  if (!Array.isArray(ids) || !ids.length || ids.length > 1000 || new Set(ids).size !== ids.length) throw new Error('Provide distinct alert IDs');
  const selected = ids.map((id) => (state.alerts || []).find((alert) => alert.id === id));
  if (selected.some((alert) => !alert)) throw new Error('Unknown alert ID for this task');
  for (const alert of selected) {
    if (alert.acknowledgedAt) continue;
    alert.acknowledgedAt = now;
    // An acknowledgement is the agent's report, not proof of user receipt.
    record(state, 'agent_reported_user_notified', now, { alert: alert.id });
  }
  return { acknowledged: ids, remaining: pendingAlerts(state).length, meaning: 'Agent-reported notification, not independently verified user receipt.' };
}
