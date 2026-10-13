'use strict';
const $ = (id) => document.getElementById(id);
// Fragment is not sent in HTTP requests or referrers. Do not persist this local
// capability in cookies/storage or attach it to any external request.
const access = new URLSearchParams(location.hash.slice(1));
const token = access.get('token') || '';
let selected = access.get('session') || '', snapshot = null, dirty = false, loading = false, editingSession = '', stopTarget = null, renameTarget = null, bankInfo = null;
let archivePage = null, archiveKind = 'recent', notificationsEnabled = false, alertStreamStarted = false;
const languageNames = { zh: 'Chinese', en: 'English', ja: 'Japanese', ko: 'Korean', fr: 'French', de: 'German', es: 'Spanish', pt: 'Portuguese', ru: 'Russian', ar: 'Arabic' };
const outcomes = {
  compatible: ['Compatible sample', 'good'], inconclusive: ['Insufficient evidence', 'warning'], unknown_expected_model: ['Expected label absent from the bank', 'warning'], missing_expected_model: ['Expected model unavailable', 'warning'],
  difference_signal: ['Single strong difference', 'bad'], repeated_difference: ['Repeated differences', 'bad'], candidate_mismatch: ['Weak candidate mismatch', 'warning'],
  not_started: ['Not enabled', 'neutral'], disabled: ['Monitoring stopped', 'neutral'], coverage_gap: ['Coverage gaps', 'warning'], hooks_unverified: ['Hooks not verified', 'warning'],
 awaiting_sample: ['Background check pending', 'neutral'], insufficient_evidence: ['Waiting for more evidence', 'neutral'],
  task_halted: ['Task stop required', 'bad'], confirming_mismatch: ['Retrying mismatch', 'warning'], confirmed_mismatch: ['All retries mismatched', 'bad'],
  waiting_for_work_tool: ['Waiting for work activity', 'neutral'],
};
const eventNames = { probe_issued: 'Issue probe', probe_missed: 'Coverage gap', segment_started: 'Start new segment', frequency_configured: 'Update sampling settings', monitoring_stopped: 'Stop monitoring', compaction_started: 'Context compacted', interrupted: 'Task interrupted', session_ended: 'Task finished', budget_paused: 'Paused at the sample-count limit', agent_reported_user_notified: 'Agent acknowledged notification', task_name_changed: 'Update display name', codex_task_name_updated: 'Sync task title', model_label_observed: 'Retrieve claimed model', configuration_migrated: 'Migrate sampling settings', confirmation_started: 'Start mismatch retries', confirmation_result: 'Retry completed', confirmation_completed: 'Retries completed', confirmation_interrupted: 'Retries interrupted', task_halt_requested: 'Stop original task required', task_resumed: 'Task resumed at the user\'s request' };
const reasons = { monitoring_started: 'Enable monitoring', reported_model_changed: 'Claimed model changed', expected_model_changed: 'Expected model changed', context_compaction: 'Context compacted', context_cleared: 'Context cleared', reference_bank_changed: 'Reference bank changed', expired_or_ignored: 'Probe expired or not submitted', late_submission: 'Submission timed out', monitoring_stopped: 'Monitoring stopped', user_interrupted: 'User interruption', session_ended: 'Task finished', stop_continuation_not_completed: 'Final probe incomplete', probe_language_changed: 'Probe language changed to English', comparison_changed: 'Retry conditions changed', comparison_unavailable: 'Cannot compare the expected model' };
const date = (at) => at ? new Date(at).toLocaleString('en-US', { hour12: false }) : '—';
const time = (at) => at ? new Date(at).toLocaleTimeString('en-US', { hour12: false }) : '—';
const txt = (id, text) => { $(id).textContent = text; };
const displayOutcome = (sample) => sample.displayOutcome || (sample.outcome === 'unknown_expected_model' && !sample.expected ? 'missing_expected_model' : sample.outcome);
function element(tag, className, text) { const node = document.createElement(tag); if (className) node.className = className; if (text !== undefined) node.textContent = text; return node; }
function pill(code) { const [label, color] = outcomes[code] || [code, 'neutral']; return element('span', `pill ${color}`, label); }
function inlineEmpty(parent, text) { parent.replaceChildren(element('div', 'empty-inline', text)); }
function showDetail(record, title = 'Checkpoint details') { txt('detail-title', title); txt('detail-body', JSON.stringify(record, null, 2)); $('detail').showModal(); }
async function api(route, body) {
  const response = await fetch(route, { method: body === undefined ? 'GET' : 'POST', headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(6000) });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error || `Request failed (${response.status})`), { status: response.status });
  return result;
}
function modelPair(expected, prediction) {
  const node = element('div', 'alert-models');
  node.append(document.createTextNode(expected || 'Unknown'), element('span', '', ` → ${prediction || 'Unknown'}`));
  return node;
}
function renderConfirmation(state) {
  const batch = state.confirmation, halt = state.taskHalt;
  $('confirmation-panel').hidden = !batch && !halt;
  if (!batch && !halt) return;
  const done = batch?.results.length || 0, mismatches = batch?.results.filter((result) => result.mismatch).length || 0;
  let label, note, color = 'warning';
  if (halt) {
    label = 'Task stop required'; color = 'bad';
    note = `After the initial mismatch, all ${halt.retryCount} additional retries mismatched expected model ${halt.expected}. The agent must immediately stop the original task, notify the user, and wait for a decision. Acknowledging alerts, changing settings, or stopping monitoring does not lift this stop instruction.`;
  } else if (batch.status === 'active') {
    label = `Retries ${done} / ${batch.target}`;
    const next = state.pendingNotifications ? 'Waiting for the agent to notify the user and acknowledge the alert' : state.pending ? 'Background retries in progress' : 'Waiting for the next background retry';
    note = `Initial mismatch recorded; completed ${done} / ${batch.target} retries, including ${mismatches} mismatches. ${next}. This batch uses ${languageNames[batch.language] || batch.language}. The current retry count (${state.frequency.retryCount}) applies to the next batch only.`;
  } else if (batch.status === 'completed') {
    label = 'Retries completed'; color = batch.allMismatch ? 'bad' : 'neutral';
    note = batch.allMismatch ? `${batch.target} retries all mismatched; the user requested resumption. History is retained.` : `${batch.target} retries:  ${mismatches} mismatches; the condition requiring all retries to mismatch was not met. Initial and retry records are retained.`;
  } else {
    label = 'Retries interrupted';
    note = `Completed ${done} / ${batch.target} retries. ${reasons[batch.reason] || batch.reason || 'Retries incomplete'}; incomplete retries do not count as mismatches. Existing results are retained.`;
  }
  txt('confirmation-status', label); $('confirmation-status').className = `pill ${color}`;
  txt('confirmation-note', note);
}
function renderAlerts(state) {
  const pending = state.pendingNotifications;
  txt('pending-alerts', pending ? `${pending} awaiting notification` : 'None awaiting notification');
  $('pending-alerts').className = `pill ${pending ? 'warning' : 'neutral'}`;
  if (!state.alerts.length) return inlineEmpty($('alerts'), 'No mismatch alerts yet · Does not guarantee consistency throughout the task');
  const rows = state.alerts.slice(-20).reverse().map((alert) => {
    const item = element('article', 'alert-item');
    const head = element('div', 'alert-item-head');
    head.append(element('span', '', date(alert.at)), element('span', `pill ${alert.acknowledgedAt ? 'neutral' : 'warning'}`, alert.acknowledgedAt ? 'Agent acknowledged' : 'Awaiting agent notification'));
    const detail = element('button', '', 'View records ↗'); detail.type = 'button'; detail.addEventListener('click', () => showDetail(alert));
    item.append(head, modelPair(alert.expected, alert.prediction), element('p', '', (outcomes[alert.level]?.[0] || alert.level) + ' · Uncalibrated; does not prove replacement'), detail);
    return item;
  });
  $('alerts').replaceChildren(...rows);
}
function renderTrace(state) {
  const points = [...state.samples.map((sample) => ({ ...sample, kind: 'sample' })), ...state.events.filter((event) => event.type === 'probe_missed').map((event) => ({ ...event, kind: 'gap' }))].sort((a, b) => a.at - b.at).slice(-80);
  if (!points.length) { $('trace').replaceChildren(element('div', 'trace-empty', 'No completed checkpoints yet; waiting for the background check')); txt('trace-range', 'No completed checkpoints yet'); return; }
  $('trace').replaceChildren(...points.map((point) => {
    const kind = point.kind === 'gap' ? 'gap' : point.outcome === 'compatible' ? 'compatible' : ['difference_signal', 'repeated_difference'].includes(point.outcome) ? 'difference' : 'uncertain';
    const node = element('button', `trace-point ${kind}`); node.type = 'button';
    node.title = `${date(point.at)} · ${point.kind === 'gap' ? 'Coverage gap' : outcomes[displayOutcome(point)]?.[0] || point.outcome}${point.prediction ? ` · ${point.prediction}` : ''}`;
    node.setAttribute('aria-label', node.title); node.addEventListener('click', () => showDetail(point)); return node;
  }));
  txt('trace-range', `Recent ${points.length} checkpoints · ${time(points[0].at)} — ${time(points.at(-1).at)}`);
}
function renderHistory(state) {
  const filter = $('filter').value;
  const records = archivePage ? archivePage.rows.map((r) => archiveKind === 'samples' ? { ...r, type: 'sample' } : archiveKind === 'alerts' ? { ...r, type: r.level, model: `${r.expected} → ${r.prediction}` } : r) : [...state.samples.map((s) => ({ ...s, type: 'sample' })), ...state.events.filter((e) => !['probe_scored', 'model_mismatch_alert'].includes(e.type))].sort((a, b) => b.at - a.at);
  const filtered = records.filter((r) => filter === 'all' || (filter === 'gap' ? r.type === 'probe_missed' : r.type === 'sample' && r.expectedWeight !== null && r.expected && r.expected !== r.prediction));
  const rows = filtered.slice(0, 100).map((record) => {
    const row = element('tr');
    const at = element('td', 'table-time'); const button = element('button', 'row-detail', date(record.at)); button.type = 'button'; button.addEventListener('click', () => showDetail(record)); at.append(button);
    const outcome = element('td'); outcome.append(record.type === 'sample' ? pill(displayOutcome(record)) : element('span', `pill ${record.type === 'probe_missed' || record.type === 'budget_paused' ? 'warning' : 'neutral'}`, eventNames[record.type] || record.type));
    const model = element('td', 'table-model'); model.textContent = record.type === 'sample' ? `${record.expected || 'Unavailable at the time'} → ${record.prediction || 'Unknown'}` : record.name || record.model || reasons[record.reason] || record.reason || '—';
    row.append(at, outcome, model, element('td', '', languageNames[record.language] || record.language || '—'), element('td', '', `#${record.epoch}`)); return row;
  });
  if (!rows.length) { const row = element('tr'); const cell = element('td', 'empty-inline', 'No records match the filter'); cell.colSpan = 5; row.append(cell); rows.push(row); }
  $('rows').replaceChildren(...rows);
  txt('history-note', `Showing ${archivePage ? 'current page:' : 'recent records:'} ${Math.min(filtered.length, 100)} filtered records${archivePage ? ` · Total in this category: ${archivePage.total} records` : ''}. Click a timestamp for details; select full history to page through earlier records.`);
  $('history-more').disabled = !archivePage?.nextBefore;
}
function loadForm(state) {
  if (dirty && editingSession === state.id) return;
  editingSession = state.id; dirty = false;
  for (const [key, value] of Object.entries(state.frequency)) {
    if (key === 'languages') { for (const input of $('languages').querySelectorAll('input')) input.checked = value.includes(input.value); }
    else if ($('config-form').elements.namedItem(key)) $('config-form').elements.namedItem(key).value = value;
  }
  txt('settings-status', state.enabled ? 'Changes apply within the original task' : 'Stopped · Re-enable monitoring in the target task');
}
function render(state) {
  snapshot = state;
  $('empty').hidden = Boolean(state); $('monitoring').hidden = !state;
  $('rename-task').disabled = !state; $('task-identity').hidden = !state;
  if (!state) {
    for (const id of ['expected', 'accepted', 'mismatches', 'missed']) txt(id, '—');
    txt('issued', ''); txt('expected-note', 'Waiting for task model information'); txt('sample-note', 'Counts submitted samples only'); txt('alert-note', 'Strong differences and weak candidates are recorded separately'); txt('hook-note', 'Hooks not observed');
    txt('runtime', 'Not enabled'); $('runtime').className = 'pill neutral'; return;
  }
  const runtime = outcomes[state.status] || [state.status, 'neutral']; txt('runtime', runtime[0]); $('runtime').className = `pill ${runtime[1]}`;
  txt('task-meta', `Task ID: ${state.session} · Last enabled: ${date(state.enabledAt || state.startedAt || state.createdAt)}${state.workspaceName ? ` · Working directory: ${state.workspaceName}` : ''}`);
  txt('expected', state.expectedModel || 'Not available'); txt('expected-note', !state.expectedModel ? 'The claimed label is unavailable; compatibility cannot be compared yet' : state.expectedSource === 'explicit' ? `User-selected · Claimed ${state.reportedModel || 'Not available'}` : 'Following the Codex claimed label · Not backend authentication');
  txt('accepted', state.probesAccepted); txt('issued', `/ ${state.probesIssued} Issued`);
  txt('sample-note', `Background snapshot fork · ${state.background?.running ? 'Checking' : state.pending ? 'Queued' : 'No probe in flight'}`);
  txt('mismatches', state.mismatchAlerts); txt('alert-note', `${state.differenceSignals} strong differences · ${state.pendingNotifications} awaiting notification`);
  txt('missed', state.missedProbes + (state.pendingExpired ? 1 : 0));
  txt('hook-note', state.hookObserved ? `Recent work hook ${time(state.lastWorkHookAt)}` : state.hookState === 'idle' ? `No new work-tool activity · Recent ${date(state.lastWorkHookAt)}` : state.hookState === 'awaiting_background_hook' ? 'Work-tool activity observed; waiting for background hook validation' : 'Waiting for the current work tool to validate hooks');
  renderConfirmation(state); renderTrace(state); renderAlerts(state); renderHistory(state);
  const forkFailure = state.forkHealth?.ready === false && state.forkHealth.error ? state.forkHealth : null;
  const failureNote = forkFailure ? ` · Check incomplete: ${forkFailure.error}${forkFailure.diagnostic ? ` [${forkFailure.diagnostic.stage} / ${forkFailure.diagnostic.code}]` : ''}` : '';
  txt('fork-note', `${state.snapshot ? `Frozen snapshot ${state.snapshot.sha256?.slice(0, 12) || 'Awaiting acknowledgment'}…` : 'No baseline snapshot is currently retained'}${state.forkCleanup ? ` · Last cleanup: ${({ pending: 'Pending deletion', deleted: 'Deleted', blocked: 'Needs inspection' })[state.forkCleanup.status] || state.forkCleanup.status}` : ''}${state.forkCleanup?.error ? ` · ${state.forkCleanup.error}` : ''}${failureNote}`);
  const latest = state.samples.at(-1); $('weights').replaceChildren();
  txt('latest-language', latest ? languageNames[latest.language] || latest.language : '—');
  if (!latest) inlineEmpty($('latest'), 'Waiting for the first valid sample');
  else {
    $('latest').replaceChildren(element('div', 'latest-model', latest.prediction || 'Unknown'), pill(displayOutcome(latest)), element('p', 'latest-caption', `${date(latest.at)} · ${latest.actualCount} / ${latest.requestedCount} integers · Segment #${latest.epoch}`));
    if (latest.fork) $('latest').append(element('p', 'section-note', latest.fork.usage ? `Cached input ${latest.fork.usage.cachedInputTokens} / ${latest.fork.usage.inputTokens} tokens` : 'Codex returned no cache count for this check'));
    if (displayOutcome(latest) === 'missing_expected_model') $('latest').append(element('p', 'section-note', 'The expected model was unavailable when this sample was collected. Only fingerprint candidates can be listed; compatibility cannot be determined. Labels obtained later are not added to earlier samples.'));
    else if (displayOutcome(latest) === 'unknown_expected_model') $('latest').append(element('p', 'section-note', `Expected label at sampling time: "${latest.expected}" is absent from the reference bank; the leading candidate comes from the existing bank and does not confirm replacement.`));
    for (const candidate of latest.top3 || []) {
      const row = element('div', 'weight-row'), meter = element('meter'); meter.min = 0; meter.max = 1; meter.value = candidate.closedSetWeight; meter.setAttribute('aria-label', `${candidate.model} Closed-set weights`);
      row.append(element('span', 'weight-label', candidate.model), meter, element('span', 'weight-number', Number(candidate.closedSetWeight).toFixed(3))); $('weights').append(row);
    }
  }
  $('config-fields').disabled = !state.enabled; $('save').disabled = !state.enabled; $('stop').disabled = !state.enabled;
  loadForm(state);
}
function failure(error) {
  txt('error', error.message); $('error').hidden = false;
  txt('connection', 'Connection error · Older records may be displayed'); $('connection').className = 'connection offline';
  $('save').disabled = true; $('stop').disabled = true;
  $('rename-task').disabled = true;
  txt('runtime', 'State not updated'); $('runtime').className = 'pill warning';
}
async function refresh() {
  if (loading) return;
  loading = true; $('refresh').disabled = true;
  const requested = selected;
  try {
    if (!token) throw new Error('Local access credential missing. Ask the agent to run dashboard and open the full URL returned.');
    if (!bankInfo) {
      bankInfo = await api('/api/info');
      txt('bank-badge', `${bankInfo.modelCount} candidate models`);
      txt('bank-source', `Unified fingerprint bank · ${bankInfo.modelCount} models · SHA-256 ${bankInfo.bankSha256.slice(0, 12)}… · Bundled plugin snapshot`);
      $('bank-detail').disabled = false;
    }
    const result = await api('/api/sessions');
    if (requested !== selected) return;
    if (!selected && result.sessions.length) selected = result.sessions[0].id;
    const signature = JSON.stringify(result.sessions.map((s) => [s.id, s.displayName, s.expectedModel, s.enabled])) + selected;
    if ($('session').dataset.signature !== signature) {
      const options = result.sessions.map((s) => { const option = element('option', '', `${s.enabled ? 'Enabled' : 'Stopped · History'} · ${s.displayName || 'Monitored tasks'} · ${s.expectedModel || 'Model information pending'}`); option.value = s.id; option.title = `Task ID: ${s.session}`; return option; });
      if (!result.sessions.some((s) => s.id === selected)) { const option = element('option', '', selected ? 'Monitoring is not enabled for the current task' : 'No monitored tasks yet'); option.value = selected; options.unshift(option); }
      $('session').replaceChildren(...options); $('session').value = selected; $('session').dataset.signature = signature;
    }
    const target = selected;
    let data = null;
    if (result.sessions.some((s) => s.id === target)) data = await api(`/api/sessions/${target}`);
    if (target !== selected) return;
    render(data); txt('connection', `Local service connected · ${time(Date.now())}`); $('connection').className = 'connection online';
    $('error').hidden = !result.unreadable;
    if (result.unreadable) txt('error', `${result.unreadable}  monitoring state files could not be read; none were reset or overwritten. Inspect guard status. `);
  } catch (error) { failure(error); }
  finally { loading = false; $('refresh').disabled = false; }
}
for (const [code, name] of [['en', 'English']]) {
  const label = element('label', 'language-choice'), input = element('input'); input.type = 'checkbox'; input.name = 'languages'; input.value = code;
  label.append(input, document.createTextNode(name)); $('languages').append(label);
}
$('refresh').addEventListener('click', refresh);
$('session').addEventListener('change', () => { selected = $('session').value; dirty = false; archivePage = null; archiveKind = 'recent'; $('history-kind').value = 'recent'; txt('save-message', ''); render(null); void refresh(); });
$('history-kind').addEventListener('change', () => { archiveKind = $('history-kind').value; archivePage = null; if (archiveKind === 'recent') { if (snapshot) renderHistory(snapshot); } else void loadHistory(); });
$('history-more').addEventListener('click', () => void loadHistory(archivePage?.nextBefore));
async function loadHistory(before) {
  const target = selected, kind = archiveKind;
  $('history-more').disabled = true;
  try {
    const page = await api(`/api/sessions/${target}/history?kind=${kind}${before ? `&before=${before}` : ''}`);
    if (target !== selected || kind !== archiveKind) return;
    archivePage = page; if (snapshot) renderHistory(snapshot);
  } catch (error) { failure(error); }
}
$('filter').addEventListener('change', () => { if (snapshot) renderHistory(snapshot); });
$('config-form').addEventListener('input', () => { dirty = true; txt('settings-status', 'Unsaved changes'); });
$('config-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!snapshot?.enabled) return;
  const target = snapshot.id; const body = {};
  for (const input of $('config-fields').querySelectorAll('input[type=number]')) body[input.name] = Number(input.value);
  body.languages = [...$('languages').querySelectorAll('input:checked')].map((input) => input.value);
  $('save').disabled = true; txt('save-message', 'Saving...'); $('save-message').className = '';
  try {
    if (!body.languages.length) throw new Error('Select English as the probe language');
    if (body.toolMin > body.toolMax) throw new Error('Minimum interval cannot exceed maximum interval');
    if (!Number.isInteger(body.retryCount) || body.retryCount < 1 || body.retryCount > 100) throw new Error('Mismatch retry count must be an integer in 1–100');
    const state = await api(`/api/sessions/${target}/configure`, body);
    if (target !== selected) return;
    dirty = false; render(state); txt('save-message', 'Saved · History and total counts are retained');
  } catch (error) { txt('save-message', error.message); $('save-message').className = 'error'; }
  finally { $('save').disabled = !snapshot?.enabled; }
});
$('stop').addEventListener('click', () => { stopTarget = snapshot?.id; $('stop-dialog').showModal(); });
$('cancel-stop').addEventListener('click', () => $('stop-dialog').close());
$('confirm-stop').addEventListener('click', async () => {
  $('stop-dialog').close(); if (!stopTarget) return;
  try { const state = await api(`/api/sessions/${stopTarget}/stop`, {}); if (state.id === selected) render(state); }
  catch (error) { failure(error); }
});
$('close-detail').addEventListener('click', () => $('detail').close());
$('bank-detail').addEventListener('click', () => { if (bankInfo) showDetail(bankInfo, 'Fingerprint bank and stylesheet sources'); });
$('rename-task').addEventListener('click', () => {
  if (!snapshot) return;
  renameTarget = snapshot.id; $('task-name').value = snapshot.taskName || ''; txt('name-message', ''); $('name-dialog').showModal(); $('task-name').focus();
});
$('cancel-name').addEventListener('click', () => $('name-dialog').close());
$('name-form').addEventListener('submit', async (event) => {
  event.preventDefault(); if (!renameTarget) return;
  $('save-name').disabled = true;
  try {
    const result = await api(`/api/sessions/${renameTarget}/name`, { name: $('task-name').value });
    $('name-dialog').close();
    if (result.id === selected) render(result);
    await refresh();
  } catch (error) { txt('name-message', error.message); }
  finally { $('save-name').disabled = false; }
});
$('copy-start').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('Use $modeltrace-guard to enable monitoring for this task with English probes.'); txt('copy-start', 'Copied'); }
  catch { txt('copy-start', 'Copy the text on the left manually'); }
});
// Preserve the capability fragment when using page navigation links.
for (const link of document.querySelectorAll('a[href^="#"]')) link.addEventListener('click', (event) => {
  event.preventDefault();
  const id = link.getAttribute('href').slice(1) || 'overview';
  if ($(id)?.getClientRects().length) {
    for (const nav of document.querySelectorAll('.nav-button')) nav.classList.toggle('active', nav === link);
    $(id).scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
$('enable-notifications').addEventListener('click', async () => {
  if (typeof Notification === 'undefined') { txt('notification-status', 'This browser does not support desktop notifications; alerts remain available on this page'); return; }
  notificationsEnabled = await Notification.requestPermission() === 'granted';
  txt('notification-status', notificationsEnabled ? 'Desktop alerts enabled · Keep this page open' : 'Notification permission not granted · Alerts remain available on this page');
  startAlertStream();
});
function startAlertStream() {
  if (alertStreamStarted || !token || typeof TextDecoder === 'undefined') return;
  alertStreamStarted = true;
  const seen = new Set();
  void (async () => {
    for (;;) {
      try {
        const response = await fetch('/api/alerts', { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Alert connection unavailable');
        const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = '';
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let end;
          while ((end = buffer.indexOf('\n\n')) >= 0) {
            const event = buffer.slice(0, end); buffer = buffer.slice(end + 2);
            const line = event.split('\n').find((row) => row.startsWith('data: '));
            if (!line || event.includes('event: unavailable')) continue;
            const data = JSON.parse(line.slice(6)); const a = data.alert;
            const key = `${data.taskId}:${a.id}:${a.level}`; if (seen.has(key)) continue;
            seen.add(key); if (seen.size > 2000) seen.delete(seen.values().next().value);
            const body = `${data.task}: expected ${a.expected}; leading candidate: ${a.prediction}${a.level === 'confirmed_mismatch' ? `; ${a.retryCount} retries all mismatched; task stop required` : ''}`;
            txt('live-notice', body); $('live-notice').hidden = false;
            if (notificationsEnabled && Notification.permission === 'granted') new Notification('ModelTrace Guard mismatch alert', { body, tag: key });
            void refresh();
          }
        }
      } catch { txt('notification-status', 'Alert connection interrupted; reconnecting. Records are retained.'); }
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }
  })();
}
startAlertStream();
setInterval(() => { if (!document.hidden) void refresh(); }, 3000);
void refresh();
