/**
 * Deep Research Pipeline Implementation
 */

import { SearchResults, SearchResult } from "./models";
import { MODEL_CONFIG, PROMPTS, RESEARCH_CONFIG } from "./config";
import { togetheraiClient, searchOnExa } from "./apiClients";
import {
  generateText,
  generateObject,
  extractReasoningMiddleware,
  wrapLanguageModel,
} from "ai";
import { z } from "zod";
import { saveResearchReport } from "./utils";
import crypto from "crypto";
import fs from "fs";
import path from "path";

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
  private useCache: boolean = false;
  private cacheDir: string | null = null;
  private locksDir: string | null = null;
  private interactive: boolean = false;
  private userTimeout: number = 30.0;
  private debugFilePath: string | null = null;
  private clarificationContext: string | null = null;

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
      removeThinkingTags?: boolean;
      maxQueries?: number;
      maxSources?: number;
      maxCompletionTokens?: number;
      userTimeout?: number;
      interactive?: boolean;
      debugFilePath?: string | null;
      cacheDir?: string | null;
      useCache?: boolean;
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

    // Set other options
    this.userTimeout = options.userTimeout || 30.0;
    this.interactive = options.interactive || false;
    this.debugFilePath = options.debugFilePath || null;
    this.useCache = options.useCache || false;

    // Set up cache if enabled
    if (this.useCache) {
      this.cacheDir =
        options.cacheDir ||
        path.join(
          process.env.HOME || process.env.USERPROFILE || "",
          ".open_deep_research_cache"
        );
      this.locksDir = path.join(this.cacheDir, ".locks");

      // Create directories if they don't exist
      if (!fs.existsSync(this.cacheDir)) {
        fs.mkdirSync(this.cacheDir, { recursive: true });
      }
      if (!fs.existsSync(this.locksDir)) {
        fs.mkdirSync(this.locksDir, { recursive: true });
      }
    }
  }

  /**
   * Generate initial research queries based on the topic
   *
   * @param topic The research topic
   * @returns List of search queries
   */
  async generateInitialQueries(topic: string): Promise<string[]> {
    const queries = await this.generateResearchQueries(topic);

    // Add the original topic as the first query (like in the Python version)
    let allQueries = [topic, ...queries];

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

    // Truncate long queries to avoid issues (like in the Python version)
    if (query.length > 400) {
      query = query.substring(0, 400);
      console.log(
        `\x1b[33m⚠️ Truncated query to 400 characters: ${query}\x1b[0m`
      );
    }

    const searchResults = await searchOnExa({
      query,
      includeRawContent: true,
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
          content: result.content,
          filteredRawContent: summarizedContent,
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
   * Get cache path for a query
   */
  private getCachePath(query: string): string {
    const queryHash = crypto.createHash("md5").update(query).digest("hex");
    return path.join(this.cacheDir!, `exa_${queryHash}.json`);
  }

  /**
   * Get lock path for a cache file
   */
  private getLockPath(cachePath: string): string {
    return `${cachePath}.lock`;
  }

  /**
   * Save search results to cache
   */
  private saveToCache(query: string, results: SearchResults): void {
    if (!this.useCache || !this.cacheDir) return;

    const cachePath = this.getCachePath(query);
    const lockPath = this.getLockPath(cachePath);

    // Create lock file
    fs.writeFileSync(lockPath, "");

    try {
      // Save results to cache
      fs.writeFileSync(cachePath, JSON.stringify(results));
    } finally {
      // Remove lock file
      if (fs.existsSync(lockPath)) {
        fs.unlinkSync(lockPath);
      }
    }
  }

  /**
   * Load search results from cache
   */
  private loadFromCache(query: string): SearchResults | null {
    if (!this.useCache || !this.cacheDir) return null;

    const cachePath = this.getCachePath(query);
    const lockPath = this.getLockPath(cachePath);

    // Check if cache exists and is not locked
    if (fs.existsSync(cachePath) && !fs.existsSync(lockPath)) {
      try {
        const cacheData = JSON.parse(fs.readFileSync(cachePath, "utf8"));
        return new SearchResults(cacheData.results);
      } catch (e) {
        console.warn(`Failed to load cache for query '${query}': ${e}`);
      }
    }

    return null;
  }

  /**
   * Execute searches for all queries in parallel
   *
   * @param queries List of search queries
   * @returns Combined search results
   */
  async performSearch(queries: string[]): Promise<SearchResults> {
    const tasks = queries.map(async (query) => {
      // Try to load from cache first
      if (this.useCache) {
        const cachedResults = this.loadFromCache(query);
        if (cachedResults) {
          console.log(
            `\x1b[32m📦 Using cached results for query: ${query}\x1b[0m`
          );
          return cachedResults;
        }
      }

      // If not in cache, perform search
      const results = await this.webSearch(query);

      // Save to cache
      if (this.useCache) {
        this.saveToCache(query, results);
      }

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
   * Filter search results based on relevance to the topic
   *
   * @param topic The research topic
   * @param results Search results to filter
   * @returns Tuple of (filtered results, source list)
   */
  private async filterResults(
    topic: string,
    results: SearchResults
  ): Promise<[SearchResults, number[]]> {
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
        { role: "system", content: this.prompts.filterParsingPrompt },
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

    return [filteredResults, limitedSources];
  }

  /**
   * Clarify the research topic through interactive conversation
   *
   * @param topic The research topic to clarify
   * @returns The clarified topic
   */
  private async clarifyTopic(topic: string): Promise<string> {
    console.log(`\x1b[36m🔍 Clarifying topic: ${topic}\x1b[0m`);

    const clarification = await generateText({
      model: togetheraiClient(this.modelConfig.planningModel),
      messages: [
        { role: "system", content: this.prompts.clarificationPrompt },
        { role: "user", content: `Research Topic: ${topic}` },
      ],
    });

    console.log(`\x1b[36m📝 Topic Clarification: ${clarification.text}\x1b[0m`);

    // In a real implementation, this would prompt the user for input
    // For now, we'll simulate it with a timeout
    if (this.interactive) {
      // Simulate user input with a timeout
      const userInput = await this.getUserInputWithTimeout(
        "\nPlease provide additional details or type 'continue' to proceed with the research: ",
        this.userTimeout
      );

      if (
        userInput.toLowerCase() === "continue" ||
        !userInput ||
        userInput === ""
      ) {
        return this.clarificationContext
          ? `${topic}\n\nContext: ${this.clarificationContext}`
          : topic;
      }

      // Store the clarification context
      if (!this.clarificationContext) {
        this.clarificationContext = userInput;
      } else {
        this.clarificationContext += `\n${userInput}`;
      }

      // Get follow-up clarification
      const followUpClarification = await generateText({
        model: togetheraiClient(this.modelConfig.planningModel),
        messages: [
          { role: "system", content: this.prompts.clarificationPrompt },
          {
            role: "user",
            content: `Research Topic: ${topic}\nPrevious Context: ${this.clarificationContext}`,
          },
        ],
      });

      console.log(
        `\x1b[36m📝 Follow-up Clarification: ${followUpClarification.text}\x1b[0m`
      );
      this.currentSpending += 1;

      // Recursively continue clarification
      return this.clarifyTopic(topic);
    }

    return topic;
  }

  /**
   * Get user input with a timeout
   *
   * @param prompt The prompt to display to the user
   * @param timeout The timeout in seconds
   * @returns The user input or an empty string if timed out
   */
  private async getUserInputWithTimeout(
    prompt: string,
    timeout: number
  ): Promise<string> {
    // In a real implementation, this would use a proper input mechanism
    // For now, we'll simulate it with a timeout
    return new Promise((resolve) => {
      console.log(prompt);

      // Simulate user input after timeout
      setTimeout(() => {
        resolve("");
      }, timeout * 1000);
    });
  }

  /**
   * Run the complete research pipeline
   *
   * @param topic The research topic
   * @returns The research answer
   */
  async runResearch(topic: string): Promise<string> {
    // Step 0: Clarify the research topic if in interactive mode
    let clarifiedTopic = topic;
    if (this.interactive) {
      clarifiedTopic = await this.clarifyTopic(topic);
    }

    console.log(`\x1b[36m🔍 Researching topic: ${clarifiedTopic}\x1b[0m`);

    // Step 1: Generate initial queries
    const initialQueries = await this.generateInitialQueries(clarifiedTopic);

    // Step 2: Perform initial search
    const initialResults = await this.performSearch(initialQueries);

    // Step 3: Conduct iterative research
    const [results, allQueries] = await this.conductIterativeResearch(
      clarifiedTopic,
      initialResults,
      initialQueries
    );

    // Step 4: Process search results
    const processedResults = await this.processSearchResults(
      clarifiedTopic,
      results
    );

    // Step 4.5: Filter results based on relevance
    const [filteredResults, sources] = await this.filterResults(
      clarifiedTopic,
      processedResults
    );

    console.log(
      `\x1b[32m📊 Filtered results: ${filteredResults.results.length} sources kept\x1b[0m`
    );

    // Debug output if enabled
    if (this.debugFilePath) {
      console.log(
        `\x1b[36m📝 Debug mode enabled, outputting the web search results to ${this.debugFilePath}\x1b[0m`
      );
      fs.writeFileSync(
        this.debugFilePath,
        `${results}\n\n\n\n${filteredResults}`
      );
    }

    // Step 5: Generate research answer with feedback loop
    let answer = await this.generateResearchAnswer(
      clarifiedTopic,
      filteredResults
    );

    // Interactive feedback loop
    if (this.interactive) {
      while (this.currentSpending < this.researchConfig.budget) {
        console.log(`\x1b[36m📝 Answer: ${answer}\x1b[0m`);

        const userFeedback = await this.getUserInputWithTimeout(
          "\nAre you satisfied with this answer? (yes/no) If no, please provide feedback: ",
          this.userTimeout * 5
        );

        if (
          userFeedback.toLowerCase() === "yes" ||
          !userFeedback ||
          userFeedback === ""
        ) {
          return answer;
        }

        // Regenerate answer with user feedback
        clarifiedTopic = `${clarifiedTopic}\n\nReport:${answer}\n\nAdditional Feedback: ${userFeedback}`;
        console.log(
          `\x1b[36m🔄 Regenerating answer with feedback: ${userFeedback}\x1b[0m`
        );
        this.currentSpending += 1;

        answer = await this.generateResearchAnswer(
          clarifiedTopic,
          filteredResults
        );
      }
    }

    return answer;
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

  /**
   * Save the research report to a file
   *
   * @param report The research report
   * @param filename The filename to save to
   */
  async saveReport(report: string, filename: string): Promise<void> {
    await saveResearchReport(report, filename);
  }
}
