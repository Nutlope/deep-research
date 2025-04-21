import { DeepResearchPipeline } from "./deepresearch/research-pipeline";

(async () => {
  const pipeline = new DeepResearchPipeline();
  const topic = "Best open source ai model";
  const answer = await pipeline.runResearch(topic);
  console.log(`\x1b[35m📡 Research Answer:\n\n${answer}\x1b[0m`);
})();
