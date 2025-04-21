/**
 * Deep Research Pipeline Implementation
 */

import {
  SearchResults,
  SearchResult,
  FilteredResultsData,
  IterativeResearchResult,
} from "./models";
import { MODEL_CONFIG, PROMPTS, RESEARCH_CONFIG } from "./config";
import { togetheraiClient, searchOnExa } from "./apiClients";
import {
  generateText,
  generateObject,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { z } from "zod";

/**
 * Deep Research Pipeline
 *
 * This class implements the complete research pipeline, from query generation
 * to final report synthesis.
 */
export class DeepResearchPipeline {
  private modelConfig: typeof MODEL_CONFIG;
  private researchConfig: typeof RESEARCH_CONFIG;
  private prompts: typeof PROMPTS;
  private currentSpending: number = 0;

  private researchPlanSchema = z.object({
    queries: z
      .string()
      .array()
      .describe("A list of search queries to thoroughly research the topic"),
  });

  private sourceListSchema = z.object({
    sources: z.array(z.number()).describe("List of source indices to keep"),
  });

  constructor(
    modelConfig = MODEL_CONFIG,
    researchConfig = RESEARCH_CONFIG,
    prompts = PROMPTS,
    options: {
      maxQueries?: number;
      maxSources?: number;
      maxCompletionTokens?: number;
    } = {}
  ) {
    this.modelConfig = modelConfig;
    this.researchConfig = researchConfig;
    this.prompts = prompts;

    // Override config with options
    if (options.maxQueries !== undefined) {
      this.researchConfig.maxQueries = options.maxQueries;
    }
    if (options.maxSources !== undefined) {
      this.researchConfig.maxSources = options.maxSources;
    }
    if (options.maxCompletionTokens !== undefined) {
      this.researchConfig.maxTokens = options.maxCompletionTokens;
    }
  }

  /**
   * Generate initial research queries based on the topic
   *
   * @param topic The research topic
   * @returns List of search queries
   */
  private async generateInitialQueries({
    topic,
  }: {
    topic: string;
  }): Promise<string[]> {
    let allQueries = await this.generateResearchQueries(topic);

    if (this.researchConfig.maxQueries > 0) {
      allQueries = allQueries.slice(0, this.researchConfig.maxQueries);
    }

    console.log(`\n\n\x1b[36m🔍 Initial queries: ${allQueries}\x1b[0m`);

    if (allQueries.length === 0) {
      console.error("ERROR: No initial queries generated");
      return [];
    }

    return allQueries;
  }

  /**
   * Generate research queries for a given topic using LLM
   *
   * @param topic The research topic
   * @returns List of search queries
   */
  private async generateResearchQueries(topic: string): Promise<string[]> {
    const parsedPlan = await generateObject({
      model: togetheraiClient(this.modelConfig.jsonModel),
      messages: [
        { role: "system", content: this.prompts.planningPrompt },
        { role: "user", content: `Research Topic: ${topic}` },
      ],
      schema: this.researchPlanSchema,
    });

    console.log(
      `\x1b[35m📋 Research queries generated: \n - ${parsedPlan.object.queries.join(
        "\n - "
      )}\x1b[0m`
    );

    return parsedPlan.object.queries;
  }

  /**
   * Perform a single web search
   */
  private async webSearch(query: string): Promise<SearchResults> {
    console.log(`\x1b[34m🔎 Perform web search with query: ${query}\x1b[0m`);

    // Truncate long queries to avoid issues (like in the Python version)
    if (query.length > 400) {
      query = query.substring(0, 400);
      console.log(
        `\x1b[33m⚠️ Truncated query to 400 characters: ${query}\x1b[0m`
      );
    }

    const searchResults = await searchOnExa({
      query,
    });

    console.log(
      `\x1b[32m📊 Web Search Responded with ${searchResults.results.length} results\x1b[0m`
    );

    // Process and summarize raw content if available
    const processedResults = await this.processSearchResultsWithSummarization(
      query,
      searchResults.results
    );

    return new SearchResults(processedResults);
  }

  /**
   * Process search results with content summarization
   *
   * @param query The search query
   * @param results The search results to process
   * @returns Processed search results with summarized content
   */
  private async processSearchResultsWithSummarization(
    query: string,
    results: SearchResult[]
  ): Promise<SearchResult[]> {
    // Create tasks for summarization
    const summarizationTasks = [];
    const resultInfo = [];

    for (const result of results) {
      if (!result.content) {
        continue;
      }

      // Create a task for summarization
      const task = this._summarize_content_async({
        result,
        query,
      });

      summarizationTasks.push(task);
      resultInfo.push(result);
    }

    // Wait for all summarization tasks to complete
    const summarizedContents = await Promise.all(summarizationTasks);

    // Combine results with summarized content
    const formattedResults: SearchResult[] = [];
    for (let i = 0; i < resultInfo.length; i++) {
      const result = resultInfo[i];
      const summarizedContent = summarizedContents[i];

      formattedResults.push(
        new SearchResult({
          title: result.title || "",
          link: result.link,
          content: summarizedContent,
        })
      );
    }

    return formattedResults;
  }

  /**
   * Summarize content asynchronously using the LLM
   *
   * @param props The props object containing searchResult and query
   * @returns The summarized content
   */
  private async _summarize_content_async(props: {
    result: SearchResult;
    query: string;
  }): Promise<string> {
    console.log(
      `\x1b[36m📝 Summarizing content from URL: ${props.result.link}\x1b[0m`
    );

    const result = await generateText({
      model: togetheraiClient(this.modelConfig.summaryModel),
      messages: [
        { role: "system", content: this.prompts.rawContentSummarizerPrompt },
        {
          role: "user",
          content: `<Raw Content>${props.result.content}</Raw Content>\n\n<Research Topic>${props.query}</Research Topic>`,
        },
      ],
    });

    return result.text;
  }

  /**
   * Execute searches for all queries in parallel
   *
   * @param queries List of search queries
   * @returns Combined search results
   */
  private async performSearch({
    queries,
  }: {
    queries: string[];
  }): Promise<SearchResults> {
    const tasks = queries.map(async (query) => {
      // Perform search
      const results = await this.webSearch(query);
      return results;
    });

    const resultsList = await Promise.all(tasks);

    let combinedResults = new SearchResults([]);
    for (const results of resultsList) {
      combinedResults = combinedResults.add(results);
    }

    const combinedResultsDedup = combinedResults.dedup();
    console.log(
      `Search complete, found ${combinedResultsDedup.results.length} results after deduplication`
    );

    return combinedResultsDedup;
  }

  /**
   * Evaluate if the current search results are sufficient or if more research is needed
   *
   * @param topic The research topic
   * @param results Current search results
   * @param queries List of queries already used
   * @returns List of additional queries needed or empty list if research is complete
   */
  private async evaluateResearchCompleteness(
    topic: string,
    results: SearchResults,
    queries: string[]
  ): Promise<string[]> {
    const formattedResults = results.toString();

    // context length issue here!

    const evaluation = await generateText({
      model: togetheraiClient(this.modelConfig.planningModel),
      messages: [
        { role: "system", content: this.prompts.evaluationPrompt },
        {
          role: "user",
          content:
            `<Research Topic>${topic}</Research Topic>\n\n` +
            `<Search Queries Used>${queries}</Search Queries Used>\n\n` +
            `<Current Search Results>${formattedResults}</Current Search Results>`,
        },
      ],
    });

    console.log(
      "\x1b[43m🔄 ================================================\x1b[0m\n\n"
    );
    console.log(`\x1b[36m📝 Evaluation:\n\n ${evaluation.text}\x1b[0m`);

    const parsedEvaluation = await generateObject({
      model: togetheraiClient(this.modelConfig.jsonModel),
      messages: [
        { role: "system", content: this.prompts.evaluationParsingPrompt },
        {
          role: "user",
          content: `Evaluation to be parsed: ${evaluation.text}`,
        },
      ],
      schema: this.researchPlanSchema,
    });

    return parsedEvaluation.object.queries;
  }

  /**
   * Process search results by deduplicating and filtering
   *
   * @param topic The research topic
   * @param results Search results to process
   * @returns Filtered search results
   */
  private async processSearchResults({
    topic,
    results,
  }: {
    topic: string;
    results: SearchResults;
  }): Promise<SearchResults> {
    // Deduplicate results
    results = results.dedup();
    console.log(
      `Search complete, found ${results.results.length} results after deduplication`
    );

    return results;
  }

  /**
   * Filter search results based on relevance to the topic
   *
   * @param topic The research topic
   * @param results Search results to filter
   * @returns Tuple of (filtered results, source list)
   */
  private async filterResults({
    topic,
    results,
  }: {
    topic: string;
    results: SearchResults;
  }): Promise<FilteredResultsData> {
    const formattedResults = results.toString();

    const filterResponse = await generateText({
      model: togetheraiClient(this.modelConfig.planningModel),
      messages: [
        { role: "system", content: this.prompts.filterPrompt },
        {
          role: "user",
          content: `<Research Topic>${topic}</Research Topic>\n\n<Current Search Results>${formattedResults}</Current Search Results>`,
        },
      ],
    });

    console.log(`\x1b[36m📝 Filter response: ${filterResponse.text}\x1b[0m`);

    const parsedFilter = await generateObject({
      model: togetheraiClient(this.modelConfig.jsonModel),
      messages: [
        { role: "system", content: this.prompts.sourceParsingPrompt },
        {
          role: "user",
          content: `Filter response to be parsed: ${filterResponse.text}`,
        },
      ],
      schema: this.sourceListSchema,
    });

    const sources = parsedFilter.object.sources;
    console.log(`\x1b[36m📊 Filtered sources: ${sources}\x1b[0m`);

    // Limit sources if needed
    let limitedSources = sources;
    if (this.researchConfig.maxSources > 0) {
      limitedSources = sources.slice(0, this.researchConfig.maxSources);
    }

    // Filter the results based on the source list
    const filteredResults = new SearchResults(
      limitedSources
        .filter((i) => i > 0 && i <= results.results.length)
        .map((i) => results.results[i - 1])
    );

    return {
      filteredResults,
      sourceIndices: limitedSources,
    };
  }

  /**
   * Conduct iterative research within budget to refine results
   *
   * @param topic The research topic
   * @param initialResults Results from initial search
   * @param allQueries List of all queries used so far
   * @returns Tuple of (final results, all queries used)
   */
  private async conductIterativeResearch({
    topic,
    initialResults,
    allQueries,
  }: {
    topic: string;
    initialResults: SearchResults;
    allQueries: string[];
  }): Promise<IterativeResearchResult> {
    let results = initialResults;

    for (let i = 0; i < this.researchConfig.budget; i++) {
      // Evaluate if more research is needed
      const additionalQueries = await this.evaluateResearchCompleteness(
        topic,
        results,
        allQueries
      );

      // Exit if research is complete
      if (additionalQueries.length === 0) {
        console.log("\x1b[33m✅ No need for additional research\x1b[0m");
        break;
      }

      // Limit the number of queries if needed
      let queriesToUse = additionalQueries;
      if (this.researchConfig.maxQueries > 0) {
        queriesToUse = additionalQueries.slice(
          0,
          this.researchConfig.maxQueries
        );
      }

      console.log(
        "\x1b[43m🔄 ================================================\x1b[0m\n\n"
      );
      console.log(
        `\x1b[36m📋 Additional queries from evaluation parser: ${queriesToUse}\n\n\x1b[0m`
      );
      console.log(
        "\x1b[43m🔄 ================================================\x1b[0m\n\n"
      );

      // Expand research with new queries
      const newResults = await this.performSearch({ queries: queriesToUse });
      results = results.add(newResults);
      allQueries.push(...queriesToUse);
    }

    return {
      finalSearchResults: results,
      queriesUsed: allQueries,
    };
  }

  /**
   * Run the complete research pipeline
   *
   * @param topic The research topic
   * @returns The research answer
   */
  async runResearch(topic: string): Promise<string> {
    console.log(`\x1b[36m🔍 Researching topic: ${topic}\x1b[0m`);

    // Step 1: Generate initial queries
    const initialQueries = await this.generateInitialQueries({ topic });

    // Step 2: Perform initial search
    const initialResults = await this.performSearch({
      queries: initialQueries,
    });

    // Step 3: Conduct iterative research
    const { finalSearchResults, queriesUsed } =
      await this.conductIterativeResearch({
        topic,
        initialResults,
        allQueries: initialQueries,
      });

    // Step 4: Process search results
    const processedResults = await this.processSearchResults({
      topic,
      results: finalSearchResults,
    });

    // Step 4.5: Filter results based on relevance
    const { filteredResults, sourceIndices } = await this.filterResults({
      topic,
      results: processedResults,
    });

    console.log(
      `\x1b[32m📊 Filtered results: ${filteredResults.results.length} sources kept\x1b[0m`
    );

    // Step 5: Generate research answer with feedback loop
    let answer = await this.generateResearchAnswer({
      topic,
      results: filteredResults,
    });

    return answer;
  }

  /**
   * Generate a comprehensive answer to the research topic based on the search results
   *
   * @param topic The research topic
   * @param results Filtered search results to use for answer generation
   * @returns Detailed research answer as a string
   */
  private async generateResearchAnswer({
    topic,
    results,
  }: {
    topic: string;
    results: SearchResults;
  }): Promise<string> {
    const formattedResults = results.toString();

    const enhancedModel = wrapLanguageModel({
      model: togetheraiClient(this.modelConfig.answerModel),
      middleware: extractReasoningMiddleware({ tagName: "think" }),
    });

    const answer = await generateText({
      model: enhancedModel,
      messages: [
        { role: "system", content: this.prompts.answerPrompt },
        {
          role: "user",
          content: `Research Topic: ${topic}\n\nSearch Results:\n${formattedResults}`,
        },
      ],
    });

    return answer.text.trim();
  }
}
