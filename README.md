# Together Deep Research

A TypeScript-based implementation of Deep Research for comprehensive topic exploration.

## Overview

Together Deep Research is a TypeScript-based implementation that delivers in-depth research on complex topics requiring multi-hop reasoning.

It enhances traditional web search by producing comprehensive, well-cited content that mimics the human research process - planning, searching, evaluating information, and iterating until completion.

Based on the python implementation [open_deep_research](https://github.com/togethercomputer/open_deep_research)

## Features

- **Comprehensive Research Reports** - Generates long-form, well-cited content on complex topics
- **Multi-Stage Process** - Uses multiple self-reflection stages for quality information gathering
- **Extensible Architecture** - Built with TypeScript for type safety and better developer experience
- **Model Flexibility** - Supports multiple LLM models for different research stages
- **Configurable Parameters** - Easy customization of research depth and output format

## Usage

Run the deep research workflow:

```typescript
import { DeepResearchPipeline } from "./deepresearch/research-pipeline";

(async () => {
  const pipeline = new DeepResearchPipeline();
  const topic = "Best open source ai model";
  const answer = await pipeline.runResearch(topic);
  console.log(`\x1b[35m📡 Research Answer:\n\n${answer}\x1b[0m`);
})();
```

## Disclaimer

As an LLM-based system, this tool may occasionally:

- Generate hallucinations or fabricate information that appears plausible
- Contain biases present in its training data
- Misinterpret complex queries or provide incomplete analyses
- Present outdated information

**Always verify important information from generated reports with primary sources.**

## Inspired from

- [open_deep_research](- [open_deep_research](https://github.com/togethercomputer/open_deep_research))

## License

MIT
