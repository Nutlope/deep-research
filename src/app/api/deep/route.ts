import { DeepResearchPipeline } from "@/deepresearch/research-pipeline";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const pipeline = new DeepResearchPipeline();

    const topic = "Latest news on Trump tariffs?";
    const answer = await pipeline.runResearch(topic);
    console.log(`\x1b[35m📡 Research Answer:\n\n${answer}\x1b[0m`);

    const data = {
      message: "Hello from the API",
      timestamp: new Date().toISOString(),
      status: "success",
      answer,
    };

    // Return the response with status 200
    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    // Handle errors
    console.error("\x1b[41m⚠️ Error in GET endpoint:\x1b[0m", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
