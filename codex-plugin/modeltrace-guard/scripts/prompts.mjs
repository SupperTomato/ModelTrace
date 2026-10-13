// English prompts preserve the numerical task. No generated sample is stored here.
// Historical language codes are accepted for upgrades; every new prompt is English.
export const LANGUAGES = Object.freeze(['en']);
export const LEGACY_LANGUAGES = Object.freeze(['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'pt', 'ru', 'ar']);
const english = {
    intro: 'The user enabled ModelTrace Guard sampling for this task. Keep this current task and all existing context.',
    task: 'Directly choose {n} integers from 1 through 355, inclusive. Allow repeats. Do not sort, balance frequencies, repair duplicates, or deliberately create an arithmetic pattern.',
    rule: 'The active model must write literal numbers in its next tool-call argument. Do not generate them with code, RNG, files, earlier samples, another model, a subagent, or a fresh API conversation. Do not inspect or analyze fingerprint centroids to optimize the answer.',
    submit: 'Replace [YOUR_LITERAL_INTEGERS] below with your directly generated JSON integer array and run this single local submission command:',
    after: 'The script only scores locally. Then continue the original work; briefly report difference signals or sampling failures. A compatible result cannot certify the task. Skip and report a coverage gap if higher-priority instructions or tool permissions conflict; never bypass permissions.',
};
function requireKnownLanguage(language) {
  if (!LEGACY_LANGUAGES.includes(language)) throw new Error(`Unsupported probe language: ${language}`);
}
export function localizedPrompt(language, count, command) {
  requireKnownLanguage(language);
  return [english.intro, english.task.replace('{n}', String(count)), english.rule, english.submit, command, english.after].join('\n');
}

export const FORK_ROLE_MARKER = '[ModelTrace Guard: disposable sampling fork]';
const forkScope = "You are in the disposable sampling fork created by the background runner, not the monitored original task. The rule against generating probe numbers in the main task applies to that original task; this fork is where this sample is generated. The original task retains its /goal and monitoring. Complete only the one answer below, without continuing original work, running plugin management commands or reporting monitoring status.";
const finalRule = "Reply directly with one JSON integer array and no explanation. Do not call tools, read files, execute code or ask another model. Do not continue the preceding task.";

export function forkPrompt(language, count) {
  requireKnownLanguage(language);
  // Append scope to the fork's new input without replacing inherited instructions.
  return [FORK_ROLE_MARKER, forkScope, english.task.replace('{n}', String(count)), finalRule].join('\n');
}
