/**
 * Deep Research Pipeline Implementation
 */

import { ResearchPlan, SearchResults, SearchResult } from "./models";
import { MODEL_CONFIG, PROMPTS, RESEARCH_CONFIG } from "./config";
import { togetheraiClient, searchOnExa } from "./apiClients";
import { generateText, generateObject } from "ai";
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

  private researchPlanSchema = z.object({
    queries: z
      .array(z.string())
      .describe("A list of search queries to thoroughly research the topic"),
  });

  constructor(
    modelConfig = MODEL_CONFIG,
    researchConfig = RESEARCH_CONFIG,
    prompts = PROMPTS
  ) {
    this.modelConfig = modelConfig;
    this.researchConfig = researchConfig;
    this.prompts = prompts;
  }

  /**
   * Generate initial research queries based on the topic
   *
   * @param topic The research topic
   * @returns List of search queries
   */
  async generateInitialQueries(topic: string): Promise<string[]> {
    const queries = await this.generateResearchQueries(topic);

    if (this.researchConfig.maxQueries > 0) {
      return queries.slice(0, this.researchConfig.maxQueries);
    }

    console.log(`\n\n\x1b[36m🔍 Initial queries: ${queries}\x1b[0m`);

    if (queries.length === 0) {
      console.error("ERROR: No initial queries generated");
      return [];
    }

    return queries;
  }

  /**
   * Generate research queries for a given topic using LLM
   *
   * @param topic The research topic
   * @returns List of search queries
   */
  private async generateResearchQueries(topic: string): Promise<string[]> {
    const plan = await generateText({
      model: togetheraiClient(this.modelConfig.planningModel),
      messages: [
        { role: "system", content: this.prompts.planningPrompt },
        { role: "user", content: `Research Topic: ${topic}` },
      ],
    });

    console.log(`\x1b[35m📋 Generated plan: ${plan.text}\x1b[0m`);

    const parsedPlan = await generateObject({
      model: togetheraiClient(this.modelConfig.jsonModel),
      messages: [
        { role: "system", content: this.prompts.planParsingPrompt },
        { role: "user", content: `Plan to be parsed: ${plan.text}` },
      ],
      schema: this.researchPlanSchema,
    });

    return parsedPlan.object.queries;
  }

  /**
   * Perform a single web search
   */
  private async webSearch(query: string): Promise<SearchResults> {
    console.log(`\x1b[34m🔎 Perform web search with query: ${query}\x1b[0m`);

    const searchResults = await searchOnExa({
      query,
      includeRawContent: true,
    });

    console.log(
      `\x1b[32m📊 Web Search Responded with ${searchResults.results.length} results (Web Search returning None will be ignored for summarization)\x1b[0m`
    );

    return new SearchResults(searchResults.results);
  }

  private async parallelWebSearch(queries: string[]): Promise<SearchResults[]> {
    const tasks = queries.map((query) => this.webSearch(query));
    return Promise.all(tasks);
  }

  /**
   * Execute searches for all queries in parallel
   *
   * @param queries List of search queries
   * @returns Combined search results
   */
  async performSearch(queries: string[]): Promise<SearchResults> {
    const resultsList = await this.parallelWebSearch(queries);

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
   * Conduct iterative research within budget to refine results
   *
   * @param topic The research topic
   * @param initialResults Results from initial search
   * @param allQueries List of all queries used so far
   * @returns Tuple of (final results, all queries used)
   */
  async conductIterativeResearch(
    topic: string,
    initialResults: SearchResults,
    allQueries: string[]
  ): Promise<[SearchResults, string[]]> {
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
      const newResults = await this.performSearch(queriesToUse);
      results = results.add(newResults);
      allQueries.push(...queriesToUse);
    }

    return [results, allQueries];
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
  async processSearchResults(
    topic: string,
    results: SearchResults
  ): Promise<SearchResults> {
    // Deduplicate results
    results = results.dedup();
    console.log(
      `Search complete, found ${results.results.length} results after deduplication`
    );

    return results;
  }

  /**
   * Run the complete research pipeline
   *
   * @param topic The research topic
   * @returns The research answer
   */
  async runResearch(topic: string): Promise<string> {
    // Step 1: Generate initial queries
    const initialQueries = await this.generateInitialQueries(topic);

    // Step 2: Perform initial search
    const initialResults = await this.performSearch(initialQueries);

    // Step 3: Conduct iterative research
    const [results, allQueries] = await this.conductIterativeResearch(
      topic,
      initialResults,
      initialQueries
    );

    // Step 4: Process search results
    const processedResults = await this.processSearchResults(topic, results);

    // Step 5: Generate research answer
    const researchAnswer = await this.generateResearchAnswer(
      topic,
      processedResults
    );

    return researchAnswer;
  }

  /**
   * Generate a comprehensive answer to the research topic based on the search results
   *
   * @param topic The research topic
   * @param results Filtered search results to use for answer generation
   * @returns Detailed research answer as a string
   */
  private async generateResearchAnswer(
    topic: string,
    results: SearchResults
  ): Promise<string> {
    const formattedResults = results.toString();

    const answer = await generateText({
      model: togetheraiClient(this.modelConfig.answerModel),
      messages: [
        { role: "system", content: this.prompts.answerPrompt },
        {
          role: "user",
          content: `Research Topic: ${topic}\n\nSearch Results:\n${formattedResults}`,
        },
      ],
    });

    return answer.text;
  }
}
