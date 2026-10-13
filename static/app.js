const state = {
  challenges: [],
  bankId: window.DEFAULT_BANK_ID,
  bank: window.BANK_SUMMARIES[window.DEFAULT_BANK_ID],
  unified: window.UNIFIED_SUMMARY,
};

const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function optionalNumber(id) {
  const value = byId(id).value.trim();
  return value === "" ? null : Number(value);
}

function setMessage(element, text, type = "error") {
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = !text;
}

function activateWorkspace(name) {
  document.querySelectorAll(".workspace").forEach((item) => item.classList.toggle("active", item.id === `workspace-${name}`));
  document.querySelectorAll("[data-workspace]").forEach((item) => item.classList.toggle("active", item.dataset.workspace === name));
}

function activateMode(group, name) {
  document.querySelectorAll(`[data-${group}-mode]`).forEach((item) => item.classList.toggle("active", item.dataset[`${group}Mode`] === name));
  document.querySelectorAll(`#workspace-${group === "test" ? "test" : "library"} .mode-panel`).forEach((item) => {
    item.classList.toggle("active", item.id === `${group}-${name}` || item.id === `library-${name}`);
  });
}

async function loadChallenges() {
  byId("regenerate").disabled = true;
  byId("result").hidden = true;
  setMessage(byId("test-message"), "");
  const response = await fetch("/api/challenges");
  state.challenges = (await response.json()).challenges;
  renderChallenges();
  byId("regenerate").disabled = false;
}

function renderChallenges() {
  byId("challenge-list").innerHTML = state.challenges.map((challenge, index) => `
    <article class="challenge-item">
      <div class="challenge-header">
        <strong>Challenge ${index + 1}</strong>
        <span>${challenge.expected_count} numbers</span>
        <button type="button" data-copy="${index}">Copy prompt</button>
      </div>
      <div class="challenge-columns">
        <div><label>Send to the model being tested</label><pre>${escapeHtml(challenge.prompt)}</pre></div>
        <div><label for="output-${index}">Paste the complete output</label><textarea id="output-${index}" spellcheck="false" placeholder="Include text, punctuation, code blocks, and the complete number sequence"></textarea></div>
      </div>
    </article>
  `).join("");
  document.querySelectorAll("[data-copy]").forEach((button) => {
    button.addEventListener("click", async () => {
      await navigator.clipboard.writeText(state.challenges[Number(button.dataset.copy)].prompt);
      button.textContent = "Copied";
      window.setTimeout(() => { button.textContent = "Copy prompt"; }, 1000);
    });
  });
}

function renderResult(payload) {
  const diagnostics = payload.diagnostics.map((item, index) => `
    <span class="diagnostic ${item.accepted ? "accepted" : "rejected"}">Challenge ${index + 1}: ${item.parsed_numbers} numbers · ${item.accepted ? "Included" : "Excluded"}</span>
  `).join("");
  const rows = payload.results.map((item, index) => `
    <tr class="${index === 0 ? "winner" : ""}">
      <td>${index + 1}</td><td><strong>${escapeHtml(item.display_name)}</strong></td><td>${escapeHtml(item.family_name)}</td>
      <td><div class="probability-cell"><span><i style="width:${item.probability * 100}%"></i></span><strong>${percent(item.probability)}</strong></div></td>
      <td>${percent(item.profile_similarity)}</td>
    </tr>
  `).join("");
  const apiNote = payload.api_test
    ? `<span>API received ${payload.api_test.received}/${payload.api_test.requested} valid responses; attempts ${payload.api_test.attempted}/${payload.api_test.max_attempts}${payload.api_test.errors.length ? `, ${payload.api_test.errors.length} excluded attempts` : ""}</span>`
    : "";
  byId("result").innerHTML = `
    <div class="result-summary">
      <div><span>Top model candidate</span><strong>${escapeHtml(payload.prediction_name)}</strong></div>
      <div><span>Bank probability</span><strong>${percent(payload.probability)}</strong></div>
      <div><span>Detected family</span><strong>${escapeHtml(payload.family_prediction_name)} · ${percent(payload.family_probability)}</strong></div>
      <div><span>Valid queries</span><strong>${payload.used_outputs}/3</strong></div>
    </div>
    <div class="diagnostics">${diagnostics}</div>
    <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Model candidate</th><th>Family</th><th>Attribution probability</th><th>Distribution similarity</th></tr></thead><tbody>${rows}</tbody></table></div>
    ${apiNote ? `<div class="result-note">${apiNote}</div>` : ""}
    <div class="result-guidance" role="note" aria-label="Result explanation">
      <p>Attribution is limited to the models in the fingerprint bank. An unlisted model can be assigned to any existing candidate.</p>
      <p>Claude Code system prompts can affect model preferences and substantially bias results. Testing within Claude Code is not recommended.</p>
    </div>
  `;
  byId("result").hidden = false;
  byId("result").scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyzeManual() {
  const button = byId("analyze");
  button.disabled = true;
  setMessage(byId("test-message"), "Calculating...", "working");
  const outputs = state.challenges.map((challenge, index) => ({
    text: byId(`output-${index}`).value,
    expected_count: challenge.expected_count,
  }));
  const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ outputs }) });
  const payload = await response.json();
  if (response.ok) {
    setMessage(byId("test-message"), "");
    renderResult(payload);
  } else {
    setMessage(byId("test-message"), payload.error || "Could not complete attribution.", "error");
    byId("result").hidden = true;
  }
  button.disabled = false;
}

function renderApiProgress(states, status) {
  const valid = states.filter((state) => state === "done").length;
  const attempted = states.filter((state) => ["done", "invalid", "error"].includes(state)).length;
  const target = 3;
  byId("api-test-progress").hidden = false;
  byId("api-progress-status").textContent = status;
  byId("api-progress-count").textContent = `Valid ${valid}/${target} · Attempts ${attempted}/${states.length}`;
  byId("api-progress-fill").style.width = `${(valid / target) * 100}%`;
  byId("api-progress-steps").innerHTML = states.map((state, index) => {
    const labels = { pending: "Waiting", working: "Requesting", done: "Valid", invalid: "Too few numbers", error: "API failed", skipped: "Not needed" };
    return `<span class="progress-step ${state}"><b>${index + 1}</b>Challenge ${index + 1} · ${labels[state]}</span>`;
  }).join("");
}

async function testViaApi(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  byId("result").hidden = true;
  setMessage(byId("test-message"), "");

  const challengeResponse = await fetch("/api/challenges");
  const firstBatch = (await challengeResponse.json()).challenges;
  const retryResponse = await fetch("/api/challenges");
  const challenges = firstBatch.concat((await retryResponse.json()).challenges);
  const states = challenges.map(() => "pending");
  const outputs = [];
  const errors = [];
  const target = 3;
  const configuration = {
    base_url: byId("test-api-base").value,
    api_key: byId("test-api-key").value,
    api_model: byId("test-api-model").value,
    temperature: optionalNumber("test-temperature"),
  };
  renderApiProgress(states, "Independent challenges generated; preparing model requests");

  for (let index = 0; index < challenges.length && outputs.length < target; index += 1) {
    states[index] = "working";
    renderApiProgress(states, `Running attempt ${index + 1}; waiting for the complete model output...`);
    try {
      const response = await fetch("/api/test/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...configuration,
          prompt: challenges[index].prompt,
          expected_count: challenges[index].expected_count,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "API request failed");
      if (payload.accepted) {
        outputs.push({ text: payload.text, expected_count: challenges[index].expected_count });
        states[index] = "done";
      } else {
        errors.push(`Attempt ${index + 1}: Valid numbers ${payload.parsed_numbers}/${payload.minimum_numbers}`);
        states[index] = "invalid";
      }
    } catch (error) {
      errors.push(`Attempt ${index + 1}: ${error.message}`);
      states[index] = "error";
    }
    renderApiProgress(states, `Received ${outputs.length}/${target} valid responses`);
  }

  if (outputs.length === target) {
    states.forEach((state, index) => { if (state === "pending") states[index] = "skipped"; });
  }

  if (!outputs.length) {
    renderApiProgress(states, "No usable responses after six attempts");
    setMessage(byId("test-message"), `No output was available for analysis. ${errors[0] || ""}`, "error");
    button.disabled = false;
    return;
  }

  renderApiProgress(states, "Model responses received; calculating attribution probabilities...");
  const analysisResponse = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ outputs }),
  });
  const result = await analysisResponse.json();
  if (analysisResponse.ok) {
    const attempted = states.filter((state) => ["done", "invalid", "error"].includes(state)).length;
    result.api_test = { requested: target, attempted, max_attempts: challenges.length, received: outputs.length, errors };
    renderApiProgress(states, `Test complete: ${outputs.length}/${target} valid responses used for attribution`);
    renderResult(result);
  } else {
    setMessage(byId("test-message"), result.error || "Automatic API test failed.", "error");
  }
  button.disabled = false;
}

function updateUnifiedSummary(summary) {
  state.unified = summary;
  byId("topbar-bank-count").textContent = `${summary.model_count} model candidates`;
  byId("active-bank-badge").textContent = `${summary.model_count} model candidates`;
}

function renderInventory() {
  byId("selected-bank-name").textContent = state.bank.label;
  byId("model-options").innerHTML = state.bank.models.map((model) => `<option value="${escapeHtml(model.id)}"></option>`).join("");
  byId("bank-inventory").innerHTML = state.bank.models.length
    ? state.bank.models.map((model) => `<span class="fingerprint-item">${escapeHtml(model.display_name)}</span>`).join("")
    : `<span class="empty-inventory">No fingerprints yet</span>`;
}

async function refreshBank() {
  const response = await fetch(`/api/bank?bank_id=${encodeURIComponent(state.bankId)}`);
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not read the fingerprint bank");
  state.bank = payload;
  renderInventory();
}

async function selectBank(bankId) {
  state.bankId = bankId;
  await refreshBank();
}

async function enrollAutomatically(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const requested = Number(byId("sample-count").value);
  const started = Date.now();
  const progressTimer = window.setInterval(() => {
    const seconds = Math.floor((Date.now() - started) / 1000);
    setMessage(byId("enrollment-message"), `Detecting the API format and collecting ${requested} responses · Elapsed ${seconds} seconds`, "working");
  }, 1000);
  setMessage(byId("enrollment-message"), `Detecting the API format and collecting ${requested} responses`, "working");
  let response;
  try {
    response = await fetch("/api/enroll/auto", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        base_url: byId("api-base").value,
        api_key: byId("api-key").value,
        api_model: byId("api-model").value,
        bank_id: state.bankId,
        model_label: byId("auto-model").value,
        sample_count: requested,
        temperature: optionalNumber("temperature"),
      }),
    });
  } catch (error) {
    window.clearInterval(progressTimer);
    setMessage(byId("enrollment-message"), error.message, "error");
    button.disabled = false;
    return;
  }
  window.clearInterval(progressTimer);
  const payload = await response.json();
  if (response.ok) {
    state.bank = payload.bank;
    updateUnifiedSummary(payload.unified);
    renderInventory();
    setMessage(byId("enrollment-message"), `Collection complete: received ${payload.received}/${payload.requested} responses, ${payload.accepted} included in the fingerprint bank, ${payload.rejected} invalid responses, ${payload.errors.length} API errors.`, "success");
  } else {
    setMessage(byId("enrollment-message"), payload.error || "Automatic collection failed.", "error");
  }
  button.disabled = false;
}

function renderBankOptions(summaries, selected) {
  byId("bank-select").innerHTML = Object.entries(summaries)
    .map(([bankId, bank]) => `<option value="${escapeHtml(bankId)}"${bankId === selected ? " selected" : ""}>${escapeHtml(bank.label)}</option>`)
    .join("");
}

async function createBank(event) {
  event.preventDefault();
  const button = event.currentTarget.querySelector("button[type=submit]");
  button.disabled = true;
  const response = await fetch("/api/banks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ label: byId("new-bank-name").value }),
  });
  const payload = await response.json();
  if (response.ok) {
    window.BANK_SUMMARIES = payload.banks;
    state.bankId = payload.bank.id;
    state.bank = payload.bank;
    updateUnifiedSummary(payload.unified);
    renderBankOptions(payload.banks, state.bankId);
    renderInventory();
    byId("new-bank-name").value = "";
    byId("create-bank-form").hidden = true;
    setMessage(byId("enrollment-message"), `Created ${payload.bank.label}`, "success");
  } else {
    setMessage(byId("enrollment-message"), payload.error || "Creation failed.", "error");
  }
  button.disabled = false;
}

document.querySelectorAll("[data-workspace]").forEach((button) => button.addEventListener("click", () => activateWorkspace(button.dataset.workspace)));
document.querySelectorAll("[data-test-mode]").forEach((button) => button.addEventListener("click", () => activateMode("test", button.dataset.testMode)));
byId("bank-select").addEventListener("change", (event) => selectBank(event.target.value));
byId("regenerate").addEventListener("click", loadChallenges);
byId("analyze").addEventListener("click", analyzeManual);
byId("api-test-form").addEventListener("submit", testViaApi);
byId("auto-enrollment").addEventListener("submit", enrollAutomatically);
byId("show-create-bank").addEventListener("click", () => { byId("create-bank-form").hidden = !byId("create-bank-form").hidden; });
byId("create-bank-form").addEventListener("submit", createBank);

renderInventory();
loadChallenges();
