import { searchOnExa, searchOnTavily } from "@/deepresearch/apiClients";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const data = {
      message: "Hello from the API",
      tavily: await searchOnTavily({ query: "Who is Leo Messi?" }),
      exa: await searchOnExa({ query: "Who is Leo Messi?" }),
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
