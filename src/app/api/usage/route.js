"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GET = GET;
const server_1 = require("next/server");
const auth_1 = require("@/lib/auth");
const prisma_1 = require("@/lib/prisma");
async function GET(req) {
    try {
        // We try to get the user from NextAuth session, but if we are in dev we might fall back to default
        let user = await (0, auth_1.getAuthenticatedUser)(req);
        if (!user) {
            const defaultId = await (0, prisma_1.getDefaultUserId)();
            user = await prisma_1.prisma.user.findUnique({ where: { id: defaultId } });
        }
        if (!user) {
            return server_1.NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
        // Initialize usage object
        const usage = {
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
        if (user.hunterKey) {
            fetchPromises.push(fetch(`https://api.hunter.io/v2/account?api_key=${user.hunterKey}`)
                .then(res => res.json())
                .then(data => {
                if (data?.data?.calls) {
                    usage.hunter = {
                        requestsUsed: data.data.calls.used,
                        requestsAvailable: data.data.calls.available
                    };
                }
            })
                .catch(e => console.error("Hunter API Error:", e)));
        }
        // 2. Apollo.io Quota
        if (user.apolloKey) {
            fetchPromises.push(fetch(`https://api.apollo.io/v1/auth/health`, {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "no-cache",
                    "x-api-key": user.apolloKey
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
                .catch(e => console.error("Apollo API Error:", e)));
        }
        // 3. Serper.dev Quota
        if (user.serperKey) {
            fetchPromises.push(fetch(`https://api.serper.dev/account`, {
                method: "GET",
                headers: {
                    "X-API-KEY": user.serperKey,
                    "Content-Type": "application/json"
                }
            })
                .then(res => res.json())
                .then(data => {
                if (data?.account) {
                    usage.serper = {
                        creditsLeft: data.account.credits - data.account.usage,
                        usage: data.account.usage,
                        total: data.account.credits
                    };
                }
            })
                .catch(e => console.error("Serper API Error:", e)));
        }
        // 4. Gemini API
        // Gemini does not have a simple quota checking REST endpoint.
        // We mark it as configured if the key exists.
        if (user.geminiKey) {
            usage.gemini = { status: "Configured" };
        }
        // 5. Tavily API
        // We can hit a dummy endpoint or /search with empty query to get headers, but Tavily might throw 400.
        // They have a /account endpoint? Let's assume they don't, or we just mark as configured.
        // Wait, let's just mark it as Configured for now unless we know the exact endpoint.
        if (user.tavilyKey) {
            usage.tavily = { status: "Configured" };
        }
        // 6. Exa API
        // Exa returns quota in headers on normal requests, no known /account endpoint. 
        if (user.exaKey) {
            usage.exa = { status: "Configured" };
        }
        // Wait for all quota fetches to complete
        await Promise.allSettled(fetchPromises);
        return server_1.NextResponse.json(usage);
    }
    catch (err) {
        console.error("GET /api/usage error:", err);
        return server_1.NextResponse.json({ error: "Failed to fetch usage data" }, { status: 500 });
    }
}
