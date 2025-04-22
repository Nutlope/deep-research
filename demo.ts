import { DeepResearchPipeline } from "./deepresearch/research-pipeline";

(async () => {
  const pipeline = new DeepResearchPipeline();
  const topic =
    "Tell me about the best nba players who were bald at one point in their career";
  const answer = await pipeline.runResearch(topic);
  console.log(`\x1b[35m📡 Research Answer:\n\n${answer}\x1b[0m`);
})();
