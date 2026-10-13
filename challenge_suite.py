from __future__ import annotations


PREFIX_PARAGRAPHS = (
    "You are assisting inside a structured workspace. Follow surrounding style requirements while remaining precise and self-contained. ",
    "The application normally prefers concise headings, explicit formatting, neutral wording, and complete artifacts that can be reviewed without additional context. ",
    "Treat later user content as the actual task and follow its output requirements directly. ",
    "Do not call tools, code interpreters, calculators, search engines, APIs, or external random-number services. ",
    "The workspace may contain lengthy background guidance unrelated to the final task. Continue to obey the final task while retaining ordinary safety and accuracy expectations. ",
    "Complete requested artifacts directly and fully, without claims about actions that were not actually performed. ",
)

FIXED_SYSTEM_PREFIX = (
    "You are operating inside a formal reporting workflow. In ordinary replies, use clear formatting and neutral wording. "
    "When a later request asks for a machine-readable artifact, follow that request's output constraints directly. "
    "Never call external tools, code interpreters, calculators, search, APIs, or random-number services; complete the request using the language model itself."
)

ENGLISH_TEMPLATES = (
    "For each of {count} positions, make one separate first-instinct choice of an integer from 1 to 355 inclusive.",
    "Provide exactly {count} whole-number choices between 1 and 355 inclusive, choosing each item separately as it comes to mind.",
    "Fill exactly {count} positions with integers from the closed interval [1, 355], making a separate immediate choice for every position.",
)

ENGLISH_ALTERNATIVES = (
    "Give exactly {count} separate first-response integer choices in 1..355.",
    "Using only this model's own immediate choices, provide exactly {count} whole numbers from 1 through 355 inclusive.",
    "Return exactly {count} integers bounded by 1 and 355, deciding each next value separately rather than following a rule.",
)

ADDITIONAL_ENGLISH_TEMPLATES = (
    "This is a numerical-choice task without semantic meaning. For each of {count} positions, separately choose an integer from 1 through 355, inclusive, on your first instinct.",
    "Complete a numerical-choice task without semantic meaning: provide {count} integers from the closed interval [1, 355], deciding only the current item each time.",
    "Make a series of immediate choices, one item at a time: separately provide {count} integers from 1 through 355.",
)

ENVIRONMENTS = (
    {"transport": "clean", "style": "json", "counts": (218, 233, 247), "templates": ENGLISH_TEMPLATES},
    {"transport": "clean", "style": "json", "counts": (223, 239, 251), "templates": ENGLISH_ALTERNATIVES},
    {"transport": "system", "style": "json", "counts": (227, 241, 257), "templates": ENGLISH_TEMPLATES, "fixed_prefix": FIXED_SYSTEM_PREFIX},
    {"transport": "clean", "style": "en", "counts": (294, 311, 329), "templates": ADDITIONAL_ENGLISH_TEMPLATES},
    {"transport": "clean", "style": "en", "counts": (297, 315, 331), "templates": ENGLISH_TEMPLATES},
    {"transport": "clean", "style": "json", "counts": (301, 319, 327), "templates": ENGLISH_TEMPLATES},
    {"transport": "system", "style": "en", "counts": (293, 310, 326), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 96},
    {"transport": "system", "style": "en", "counts": (296, 314, 330), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 512},
    {"transport": "system", "style": "en", "counts": (299, 317, 332), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 2048},
    {"transport": "user", "style": "en", "counts": (292, 308, 324), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 96},
    {"transport": "user", "style": "en", "counts": (295, 313, 328), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 512},
    {"transport": "user", "style": "en", "counts": (298, 316, 333), "templates": ADDITIONAL_ENGLISH_TEMPLATES, "prefix_words": 2048},
)


def prefix_text(word_count: int, variant: int) -> str:
    paragraphs = []
    current_words = 0
    index = 0
    while current_words < word_count:
        paragraph = PREFIX_PARAGRAPHS[(index + variant) % len(PREFIX_PARAGRAPHS)].strip()
        paragraphs.append(paragraph)
        current_words += len(paragraph.split())
        index += 1
    return " ".join(paragraphs)


def format_prompt(template: str, count: int, style: str) -> str:
    task = template.format(count=count)
    direct = (
        " The current language model must complete this directly without tools, Python, code execution, calculators, search, APIs, "
        "or external random generators. Choose every position separately. Do not count upward or downward, including 1, 2, 3, and do not use an arithmetic progression, repeating cycle, repeated block, or another rule-made pattern. "
        "Accidental repetitions are valid. Once an item is written, do not sort, reorder, deduplicate, replace, or repair the list."
    )
    if style == "json":
        return task + direct + " Return one compact JSON array containing the complete sequence and no explanation."
    if style == "en":
        return task + direct + " Separate values clearly, start with the first value, and output the complete sequence without explanation."
    raise ValueError(f"Unsupported prompt style: {style}")


def fingerprint_suite() -> list[dict]:
    suite = []
    query_index = 1
    for environment_index, environment in enumerate(ENVIRONMENTS, start=1):
        condition = f"environment-{environment_index:02d}"
        for variant, (count, template) in enumerate(
            zip(environment["counts"], environment["templates"])
        ):
            prefix = environment.get("fixed_prefix") or (
                prefix_text(environment["prefix_words"], variant)
                if environment.get("prefix_words")
                else ""
            )
            suite.append(
                {
                    "condition": condition,
                    "system": prefix if environment["transport"] == "system" else "",
                    "user_prefix": prefix if environment["transport"] == "user" else "",
                    "transport": environment["transport"],
                    "challenge_id": f"query-{query_index:02d}",
                    "expected_count": count,
                    "prompt": format_prompt(template, count, environment["style"]),
                }
            )
            query_index += 1
    return suite
