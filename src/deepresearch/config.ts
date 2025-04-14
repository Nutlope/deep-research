/**
 * Configuration for the Deep Research Cookbook
 */

/**
 * Research Configuration Parameters
 *
 * These parameters control the Deep Research process, allowing customization
 * of research behavior, model selection, and output format.
 */

// Model Selection
// Specialized models for different stages of the research pipeline
export const MODEL_CONFIG = {
  planningModel: "Qwen/Qwen2.5-72B-Instruct-Turbo", // Used for research planning and evaluation
  jsonModel: "Qwen/Qwen2.5-72B-Instruct-Turbo", // Used for structured data parsing
  summaryModel: "meta-llama/Llama-4-Scout-17B-16E-Instruct", // Used for web content summarization
  answerModel: "meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8", // Used for final answer synthesis
};

// Resource Allocation
// Parameters controlling research depth and breadth
export const RESEARCH_CONFIG = {
  budget: 2, // Number of research refinement cycles to perform (in addition to the initial search operation)
  maxQueries: 2, // Maximum number of search queries per research cycle
  maxSources: 5, // Maximum number of sources to include in final synthesis
  maxTokens: 8192, // Maximum number of tokens in the generated report
};

/**
 * Core prompt function that adds current date information to all prompts
 * This ensures all models have the correct temporal context for research
 */
export const getCurrentDateContext = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1; // JavaScript months are 0-indexed
  const day = now.getDate();
  const monthName = now.toLocaleString("default", { month: "long" });

  return `Current date is ${year}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")} (${monthName} ${day}, ${year}).
When searching for recent information, prioritize results from the current year (${year}) and month (${monthName} ${year}).
For queries about recent developments, include the current year (${year}) in your search terms.
When ranking search results, consider recency as a factor - newer information is generally more relevant for current topics.`;
};

// System Prompts
// Instructions for each stage of the research process
export const PROMPTS = {
  // Clarification: Helps to clarify research topics
  clarificationPrompt: `${getCurrentDateContext()}
    You are a research assistant helping to clarify research topics.
    Analyze the given topic and if needed, ask focused questions to better understand:
    1. The scope and specific aspects to be researched
    2. Any time period or geographical constraints
    3. The desired depth and technical level
    4. Any specific aspects to include or exclude

    If the topic is already clear and specific, acknowledge that and don't ask unnecessary questions.
    Keep your response concise and focused.`,

  // Planning: Generates initial research queries
  planningPrompt: `${getCurrentDateContext()}
    You are a strategic research planner with expertise in breaking down complex
                         questions into logical search steps. Generate focused, specific, and self-contained queries that
                         will yield relevant information for the research topic.`,

  // Plan Parsing: Extracts structured data from planning output
  planParsingPrompt: `${getCurrentDateContext()}
    Extract search queries that should be executed.`,

  // Content Processing: Identifies relevant information from search results
  rawContentSummarizerPrompt: `${getCurrentDateContext()}
    Extract and synthesize only the information relevant to the research
                                       topic from this content. Preserve specific data, terminology, and
                                       context while removing irrelevant information.`,

  // Completeness Evaluation: Determines if more research is needed
  evaluationPrompt: `${getCurrentDateContext()}
    Analyze these search results against the original research goal. Identify
                          specific information gaps and generate targeted follow-up queries to fill
                          those gaps. If no significant gaps exist, indicate that research is complete.`,

  // Evaluation Parsing: Extracts structured data from evaluation output
  evaluationParsingPrompt: `${getCurrentDateContext()}
    Extract follow-up search queries from the evaluation. If no follow-up queries are needed, return an empty list.`,

  // Source Filtering: Selects most relevant sources
  filterPrompt: `${getCurrentDateContext()}
    Evaluate each search result for relevance, accuracy, and information value
                       related to the research topic. At the end, you need to provide a list of
                       source numbers with the rank of relevance. Remove the irrelevant ones.`,

  // Source Filtering: Selects most relevant sources
  sourceParsingPrompt: `${getCurrentDateContext()}
    Extract the source list that should be included.`,

  // Answer Generation: Creates final research report
  answerPrompt: `${getCurrentDateContext()}
    Create a comprehensive, publication-quality markdown research report based exclusively
                       on the provided sources. The report should include: title, introduction, analysis (multiple sections with insights titles)
                       and conclusions, references. Use proper citations (source with link; using \n\n \\[Ref. No.\\] to improve format),
                       organize information logically, and synthesize insights across sources. Include all relevant details while
                       maintaining readability and coherence. In each section, You MUST write in plain
                       paragraghs and NEVER describe the content following bullet points or key points (1,2,3,4... or point X: ...)
                       to improve the report readability.`,
};
