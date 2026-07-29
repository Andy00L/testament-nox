---
url: /getting-started/use-ai.md
description: >-
  Load the NOX documentation into your AI assistant to get accurate,
  context-aware help when building confidential smart contracts.
---

# Use AI to build on NOX

AI coding assistants work best when they have accurate, up-to-date context about
what you are building. This page shows you how to point your assistant at the
NOX documentation so it can give useful, NOX-specific answers instead of
guessing.

## Load NOX context into your AI assistant

Every build of this documentation automatically generates machine-readable
versions of the full doc:

| File                                                                 | Contents                                        |
| -------------------------------------------------------------------- | ----------------------------------------------- |
| llms.txt           | Index of all pages with titles and descriptions |
| llms-full.txt | Full documentation in a single file             |

Paste the `llms-full.txt` URL into any AI assistant that supports URL context
(Cursor, Claude, ChatGPT, Gemini) and ask your question. The assistant will read
the current documentation before answering.

**Cursor** — add this to your chat before asking NOX questions:

@{{ llmsFullAbsoluteUrl }}

**Claude** — paste the URL and ask your question in the same message. Claude
will fetch and read the documentation.

## Coming soon

The following resources are in progress:

* **Cursor rules file**
* **Skills**
