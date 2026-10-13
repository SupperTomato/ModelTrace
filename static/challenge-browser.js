function randomIndex(length) {
  const limit = Math.floor(0x100000000 / length) * length;
  const buffer = new Uint32Array(1);
  do crypto.getRandomValues(buffer); while (buffer[0] >= limit);
  return buffer[0] % length;
}

function choose(values) {
  return values[randomIndex(values.length)];
}

function uniqueLengths(count) {
  const available = Array.from({ length: 41 }, (_, index) => 292 + index);
  const output = [];
  while (output.length < count) output.push(available.splice(randomIndex(available.length), 1)[0]);
  return output;
}

export function generateChallenges(count = 3) {
  const openings = [
    "This is an independent numerical-choice record",
    "Complete the following integer-choice task without assigning meaning to the numbers",
    "Record your immediate integer choices",
    "Produce a sequence of integer choices without assigning meaning to the values",
    "Make a series of immediate choices, one item at a time",
  ];
  const actions = [
    "Separately choose, on your first instinct,",
    "Choose one at a time:",
    "Decide only the current item each time, and provide",
    "Make separate immediate choices and provide",
    "Directly choose, one at a time,",
  ];
  const endings = [
    "Repeats are allowed. After writing each value, do not go back to sort, deduplicate, or replace it. ",
    "Accidental repetitions are valid. Do not reorder or correct items already written. ",
    "A value may appear again. Do not reorganize or rewrite earlier items while producing the output. ",
    "Keep duplicate values. Do not filter, reorder, or complete the sequence into a pattern. ",
    "Assign no meaning to the numbers. Leave previously written values unchanged. ",
  ];
  const separators = [
    "Separate numbers with commas or spaces. ",
    "Use one consistent, common separator. ",
    "Separate values with commas, spaces, or newlines. ",
    "Choose any format that clearly separates each integer. ",
  ];
  return uniqueLengths(count).map((length, index) => ({
    id: `probe-${index + 1}-${crypto.randomUUID()}`,
    expected_count: length,
    prompt: `${choose(openings)}. ${choose(actions)} ${length} integers from 1 through 355, inclusive. `
      + "Choose every position separately on your first instinct. Do not count from 1, count upward or downward, or use arithmetic progressions, cycles, repeated blocks, or other rule-based patterns. "
      + "The current language model must complete this task directly, without tools, Python, code interpreters, calculators, search, APIs, or external random-number generators. Do not write or run code first. "
      + `${choose(endings)}${choose(separators)}`
      + "Begin with the first value. Do not repeat the count, range, or instructions before the sequence.",
  }));
}
