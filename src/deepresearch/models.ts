/**
 * Data models for the Deep Research Cookbook
 */

/**
 * Structured representation of a research plan with search queries.
 * Used to parse the LLM's planning output into a structured format
 * that can be easily processed by the research pipeline.
 */
export interface ResearchPlan {
  queries: string[];
}

/**
 * Structured representation of filtered source indices.
 * Used to parse the LLM's source evaluation output into a structured
 * format that identifies which search results should be retained.
 */
export interface SourceList {
  sources: number[];
}

/**
 * Container for an individual search result with its metadata and content.
 * Holds both the original content and the filtered/processed content
 * that's relevant to the research topic.
 */
export class SearchResult {
  title: string;
  link: string;
  content: string;
  filteredRawContent?: string;

  constructor(params: {
    title: string;
    link: string;
    content: string;
    filteredRawContent?: string;
  }) {
    this.title = params.title;
    this.link = params.link;
    this.content = params.content;
    this.filteredRawContent = params.filteredRawContent;
  }

  /**
   * (For Report Generation and Completeness Evaluation) String representation with title, link and refined content.
   */
  toString(): string {
    return this.filteredRawContent
      ? `Title: ${this.title}\nLink: ${this.link}\nRefined Content: ${this.filteredRawContent}`
      : `Title: ${this.title}\nLink: ${
          this.link
        }\nRaw Content: ${this.content.substring(0, 1000)}`;
  }

  /**
   * (For Filtering ONLY) Abbreviated string representation with truncated raw content.
   */
  shortStr(): string {
    return `Title: ${this.title}\nLink: ${
      this.link
    }\nRaw Content: ${this.content.substring(0, 1000)}`;
  }
}

/**
 * Collection of search results with utilities for manipulation and display.
 * Provides methods for combining result sets, deduplication, and
 * different string representations for processing and display.
 */
export class SearchResults {
  results: SearchResult[];

  constructor(results: SearchResult[]) {
    this.results = results;
  }

  /**
   * Detailed string representation of all search results with indices.
   */
  toString(): string {
    return this.results
      .map((result, i) => `[${i + 1}] ${result.toString()}`)
      .join("\n\n");
  }

  /**
   * Combine two SearchResults objects by concatenating their result lists.
   */
  add(other: SearchResults): SearchResults {
    return new SearchResults([...this.results, ...other.results]);
  }

  /**
   * Abbreviated string representation of all search results with indices.
   */
  shortStr(): string {
    return this.results
      .map((result, i) => `[${i + 1}] ${result.shortStr()}`)
      .join("\n\n");
  }

  /**
   * Remove duplicate search results based on URL.
   * Returns a new SearchResults object with unique entries.
   */
  dedup(): SearchResults {
    const seenLinks = new Set<string>();
    const uniqueResults: SearchResult[] = [];

    for (const result of this.results) {
      if (!seenLinks.has(result.link)) {
        seenLinks.add(result.link);
        uniqueResults.push(result);
      }
    }

    return new SearchResults(uniqueResults);
  }
}
