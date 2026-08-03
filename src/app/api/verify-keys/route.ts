import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));

    const hunterKey = body.hunterKey || body.hunter || "";
    const apolloKey = body.apolloKey || body.apollo || "";
    const serperKey = body.serperKey || body.serper || "";
    const geminiKey = body.geminiKey || body.gemini || "";
    const tavilyKey = body.tavilyKey || body.tavily || "";
    const exaKey = body.exaKey || body.exa || "";

    const results: Record<string, { valid: boolean; message: string }> = {};

    const checks = [];

    // 1. Hunter.io
    if (hunterKey) {
      checks.push(
        fetch(`https://api.hunter.io/v2/account?api_key=${encodeURIComponent(hunterKey)}`)
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              const used = data?.data?.calls?.used ?? 0;
              const avail = data?.data?.calls?.available ?? "N/A";
              results.hunter = { valid: true, message: `Active (${avail !== "N/A" ? avail - used : "Active"} calls remaining)` };
            } else {
              results.hunter = { valid: false, message: "Invalid Hunter.io API Key" };
            }
          })
          .catch(() => {
            results.hunter = { valid: false, message: "Network error checking Hunter.io" };
          })
      );
    }

    // 2. Apollo.io
    if (apolloKey) {
      checks.push(
        fetch(`https://api.apollo.io/v1/auth/health`, {
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apolloKey,
          },
        })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (data?.isLoggedIn) {
                results.apollo = { valid: true, message: "Active Apollo.io session verified" };
              } else {
                results.apollo = { valid: false, message: "Invalid Apollo.io API Key" };
              }
            } else {
              results.apollo = { valid: false, message: "Invalid Apollo.io API Key" };
            }
          })
          .catch(() => {
            results.apollo = { valid: false, message: "Network error checking Apollo.io" };
          })
      );
    }

    // 3. Serper.dev
    if (serperKey) {
      checks.push(
        fetch(`https://google.serper.dev/search`, {
          method: "POST",
          headers: {
            "X-API-KEY": serperKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ q: "test" }),
        })
          .then(async (res) => {
            if (res.ok) {
              results.serper = { valid: true, message: `Active Serper.dev Key verified` };
            } else {
              results.serper = { valid: false, message: "Invalid Serper.dev API Key" };
            }
          })
          .catch(() => {
            results.serper = { valid: false, message: "Network error checking Serper.dev" };
          })
      );
    }

    // 4. Gemini API
    if (geminiKey) {
      checks.push(
        fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(geminiKey)}`)
          .then(async (res) => {
            if (res.ok) {
              results.gemini = { valid: true, message: "Google Gemini API Key verified" };
            } else {
              results.gemini = { valid: false, message: "Invalid Gemini API Key" };
            }
          })
          .catch(() => {
            results.gemini = { valid: false, message: "Network error checking Gemini API" };
          })
      );
    }

    // 5. Tavily API
    if (tavilyKey) {
      checks.push(
        fetch(`https://api.tavily.com/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            api_key: tavilyKey,
            query: "test",
            max_results: 1,
          }),
        })
          .then(async (res) => {
            if (res.ok || res.status === 200) {
              results.tavily = { valid: true, message: "Tavily AI Search Key verified" };
            } else {
              results.tavily = { valid: false, message: "Invalid Tavily API Key" };
            }
          })
          .catch(() => {
            results.tavily = { valid: false, message: "Network error checking Tavily API" };
          })
      );
    }

    // 6. Exa.ai
    if (exaKey) {
      checks.push(
        fetch(`https://api.exa.ai/search`, {
          method: "POST",
          headers: {
            "x-api-key": exaKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: "test",
            numResults: 1,
          }),
        })
          .then(async (res) => {
            if (res.ok || res.status === 200) {
              results.exa = { valid: true, message: "Exa.ai Search Key verified" };
            } else {
              results.exa = { valid: false, message: "Invalid Exa.ai API Key" };
            }
          })
          .catch(() => {
            results.exa = { valid: false, message: "Network error checking Exa.ai" };
          })
      );
    }

    await Promise.all(checks);

    return NextResponse.json(results, { status: 200 });
  } catch (error) {
    console.error("[verify-keys] Error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
