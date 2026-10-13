import { analyzeGlobalOutputs } from "./fingerprint-core.js";
import { generateChallenges } from "./challenge-browser.js";

const state = { bank: null, challenges: [] };
const byId = (id) => document.getElementById(id);

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;",
  })[character]);
}

function percent(value) {
  return `${(value * 100).toFixed(1)}%`;
}

function setMessage(text, type = "error") {
  const element = byId("test-message");
  element.textContent = text;
  element.className = `message ${type}`;
  element.hidden = !text;
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
  button.textContent = "Copied";
  window.setTimeout(() => { button.textContent = "Copy prompt"; }, 1000);
}

function renderChallenges() {
  byId("result").hidden = true;
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
    button.addEventListener("click", () => copyText(state.challenges[Number(button.dataset.copy)].prompt, button));
  });
}

function regenerate() {
  state.challenges = generateChallenges(3);
  setMessage("");
  renderChallenges();
}

function renderResult(payload) {
  const diagnostics = payload.diagnostics.map((item, index) => `
    <span class="diagnostic ${item.accepted ? "accepted" : "rejected"}">Challenge ${index + 1}: ${item.parsed_numbers} numbers · ${item.accepted ? "Included" : "Excluded"}</span>
  `).join("");
  const rows = payload.results.map((item, index) => `
    <tr class="${index === 0 ? "winner" : ""}">
      <td>${index + 1}</td>
      <td><strong>${escapeHtml(item.display_name)}</strong></td>
      <td>${escapeHtml(item.family_name)}</td>
      <td><div class="probability-cell"><span><i style="width:${item.probability * 100}%"></i></span><strong>${percent(item.probability)}</strong></div></td>
      <td>${percent(item.profile_similarity)}</td>
    </tr>
  `).join("");
  const result = byId("result");
  result.innerHTML = `
    <div class="result-summary">
      <div><span>Top model candidate</span><strong>${escapeHtml(payload.prediction_name)}</strong></div>
      <div><span>Bank probability</span><strong>${percent(payload.probability)}</strong></div>
      <div><span>Model family</span><strong>${escapeHtml(payload.family_prediction_name)} · ${percent(payload.family_probability)}</strong></div>
      <div><span>Valid queries</span><strong>${payload.used_outputs}/3</strong></div>
    </div>
    <div class="diagnostics">${diagnostics}</div>
    <div class="table-wrap"><table><thead><tr><th>Rank</th><th>Model candidate</th><th>Family</th><th>Attribution probability</th><th>Distribution similarity</th></tr></thead><tbody>${rows}</tbody></table></div>
    <div class="result-guidance" role="note" aria-label="Result explanation">
      <p>Attribution is limited to the models in the fingerprint bank. An unlisted model can be assigned to any existing candidate.</p>
      <p>Claude Code system prompts can affect model preferences and substantially bias results. Testing within Claude Code is not recommended.</p>
    </div>
  `;
  result.hidden = false;
  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function analyze() {
  const button = byId("analyze");
  button.disabled = true;
  byId("result").hidden = true;
  setMessage("Calculating locally in the browser...", "working");
  await new Promise((resolve) => requestAnimationFrame(resolve));
  try {
    const outputs = state.challenges.map((challenge, index) => ({
      text: byId(`output-${index}`).value,
      expected_count: challenge.expected_count,
    }));
    renderResult(analyzeGlobalOutputs(outputs, state.bank));
    setMessage("");
  } catch (error) {
    setMessage(error.message || "Could not complete attribution.", "error");
  } finally {
    button.disabled = false;
  }
}

async function initialize() {
  try {
    const response = await fetch("./data/unified_bank.json", { cache: "no-cache" });
    if (!response.ok) throw new Error(`Fingerprint bank failed to load (HTTP ${response.status})`);
    state.bank = await response.json();
    const responseCount = state.bank.models.reduce((sum, model) => sum + model.response_count, 0);
    byId("topbar-bank-count").textContent = `${state.bank.models.length} model candidates`;
    byId("active-bank-badge").textContent = `${state.bank.models.length} models · ${responseCount} fingerprints`;
    byId("regenerate").disabled = false;
    byId("analyze").disabled = false;
    regenerate();
  } catch (error) {
    setMessage(`${error.message}. Open this page through an HTTP server or GitHub Pages.`, "error");
  }
}

byId("regenerate").addEventListener("click", regenerate);
byId("analyze").addEventListener("click", analyze);
initialize();
