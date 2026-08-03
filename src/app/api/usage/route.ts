import { NextRequest, NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { prisma, getDefaultUserId } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  try {
    // We try to get the user from NextAuth session, but if we are in dev we might fall back to default
    let user = await getAuthenticatedUser(req);
    if (!user) {
      const defaultId = await getDefaultUserId();
      user = await prisma.user.findUnique({ where: { id: defaultId } });
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Initialize usage object
    const usage: any = {
      hunter: null,
      apollo: null,
      serper: null,
      gemini: null,
      tavily: null,
      exa: null
    };

    // Helper to run promises concurrently and fail safely
    const fetchPromises = [];

    // 1. Hunter.io Quota
    const hunterKey = user.hunterKey || process.env.HUNTER_API_KEY || process.env.NEXT_PUBLIC_HUNTER_API_KEY;
    if (hunterKey) {
      fetchPromises.push(
        fetch(`https://api.hunter.io/v2/account?api_key=${hunterKey}`)
          .then(res => res.json())
          .then(data => {
            if (data?.data?.calls) {
              usage.hunter = {
                requestsUsed: data.data.calls.used,
                requestsAvailable: data.data.calls.available
              };
            }
          })
          .catch(e => console.error("Hunter API Error:", e))
      );
    }

    // 2. Apollo.io Quota
    const apolloKey = user.apolloKey || process.env.APOLLO_API_KEY || process.env.NEXT_PUBLIC_APOLLO_API_KEY;
    if (apolloKey) {
      fetchPromises.push(
        fetch(`https://api.apollo.io/v1/auth/health`, {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-cache",
            "x-api-key": apolloKey
          }
        })
          .then(res => res.json())
          .then(data => {
            // Note: Apollo's health endpoint might not return quota directly.
            // If we can't get exact credits, we can at least show it's active.
            // Some apollo API endpoints return rate limits in headers.
            // For now we'll mark as active if healthy.
            if (data?.isLoggedIn) {
              usage.apollo = {
                status: "Active",
                dailyConsumed: "N/A",
                dailyLimit: "N/A"
              };
            }
          })
          .catch(e => console.error("Apollo API Error:", e))
      );
    }

    // 3. Serper.dev Quota
    const serperKey = user.serperKey || process.env.SERPER_API_KEY;
    if (serperKey) {
      fetchPromises.push(
        fetch(`https://google.serper.dev/search`, {
          method: "POST",
          headers: {
            "X-API-KEY": serperKey,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ q: "test" })
        })
          .then(res => res.json())
          .then(data => {
            if (data?.organic) {
              usage.serper = { status: "Configured" };
            }
          })
          .catch(e => console.error("Serper API Error:", e))
      );
    }

    // 4. Gemini API
    // Gemini does not have a simple quota checking REST endpoint.
    // We mark it as configured if the key exists.
    if (user.geminiKey || process.env.GEMINI_API_KEY) {
      usage.gemini = { status: "Configured" };
    }

    // 5. Tavily API
    const tavilyKey = user.tavilyKey || process.env.TAVILY_API_KEY;
    if (tavilyKey) {
      fetchPromises.push(
        fetch(`https://api.tavily.com/usage`, {
          headers: {
            "Authorization": `Bearer ${tavilyKey}`
          }
        })
          .then(res => res.json())
          .then(data => {
            if (data?.account) {
              usage.tavily = {
                requestsUsed: data.account.plan_usage,
                requestsAvailable: data.account.plan_limit
              };
            } else {
              usage.tavily = { status: "Configured" };
            }
          })
          .catch(e => {
            console.error("Tavily API Error:", e);
            usage.tavily = { status: "Configured" };
          })
      );
    }

    // 6. Exa API
    // Exa returns quota in headers on normal requests, no known /account endpoint. 
    if (user.exaKey || process.env.EXA_API_KEY) {
       usage.exa = { status: "Configured" };
    }

    // Wait for all quota fetches to complete
    await Promise.allSettled(fetchPromises);

    // Fetch local persistent API usage cache
    const localCache = await prisma.localApiUsage.findUnique({
      where: { userId: user.id }
    });

    return NextResponse.json({
      ...usage,
      localCache: localCache || {
        serper: 0,
        apollo: 0,
        hunter: 0,
        gemini: 0,
        tavily: 0,
        exa: 0,
        search: 0
      }
    });
  } catch (err) {
    console.error("GET /api/usage error:", err);
    return NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 });
  }
}
