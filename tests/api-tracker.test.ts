import { PrismaClient } from "@prisma/client";
import { NextRequest } from "next/server";

const prisma = new PrismaClient();

// Mock the NextRequest
function createMockRequest(method: string, url: string, body?: any, apiKey?: string) {
  const headers = new Headers();
  if (apiKey) headers.set("x-api-key", apiKey);
  if (body) headers.set("Content-Type", "application/json");

  return new NextRequest(new URL(url, "http://localhost:3000"), {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function runTests() {
  console.log("Starting API Tracker Integration Tests...");
  let tempUserId: string | null = null;
  
  try {
    // 1. Create a temporary user with an API key
    const testApiKey = "test-api-key-" + Date.now();
    const tempUser = await prisma.user.create({
      data: {
        email: `test-tracker-${Date.now()}@example.com`,
        name: "Tracker Test User",
        apiKey: testApiKey,
      },
    });
    tempUserId = tempUser.id;
    console.log(`✅ Created test user: ${tempUser.email}`);

    // Import the API routes dynamically
    const { POST: settingsPost, GET: settingsGet } = await import("../src/app/api/settings/route");
    const { GET: usageGet } = await import("../src/app/api/usage/route");

    // 2. Test saving API keys
    console.log("Testing POST /api/settings...");
    const saveReq = createMockRequest("POST", "/api/settings", {
      tavilyKey: "tvly-test-123",
      exaKey: "exa-test-123",
      serperKey: "serper-test-123"
    }, testApiKey);

    const saveRes = await settingsPost(saveReq);
    const saveJson = await saveRes.json();
    if (!saveJson.success) {
      throw new Error("Failed to save API keys: " + JSON.stringify(saveJson));
    }
    console.log("✅ POST /api/settings successful");

    // 3. Verify keys were saved to the database
    const dbUser = await prisma.user.findUnique({ where: { id: tempUserId } });
    if (dbUser?.tavilyKey !== "tvly-test-123" || dbUser?.exaKey !== "exa-test-123") {
      throw new Error("API keys were not correctly saved to the database.");
    }
    console.log("✅ Keys verified in database");

    // 4. Test GET /api/settings returns the keys
    console.log("Testing GET /api/settings...");
    const getSettingsReq = createMockRequest("GET", "/api/settings", undefined, testApiKey);
    const getSettingsRes = await settingsGet(getSettingsReq);
    const getSettingsJson = await getSettingsRes.json();
    if (getSettingsJson.apiKeys.tavilyKey !== "tvly-test-123" || getSettingsJson.apiKeys.exaKey !== "exa-test-123") {
      throw new Error("GET /api/settings did not return the expected keys.");
    }
    console.log("✅ GET /api/settings verified");

    // 5. Test GET /api/usage handles the keys and attempts fetch
    console.log("Testing GET /api/usage...");
    const getUsageReq = createMockRequest("GET", "/api/usage", undefined, testApiKey);
    const getUsageRes = await usageGet(getUsageReq);
    const getUsageJson = await getUsageRes.json();
    
    // Check if the mock keys returned the "Configured" status for Tavily and Exa
    if (getUsageJson.tavily?.status !== "Configured" || getUsageJson.exa?.status !== "Configured") {
      throw new Error("GET /api/usage did not return correct status for Tavily/Exa: " + JSON.stringify(getUsageJson));
    }
    // Check if Serper was attempted (it will likely return undefined/null since key is fake, or an error log happened)
    console.log("✅ GET /api/usage successful with output:", JSON.stringify(getUsageJson, null, 2));

    console.log("\n🎉 All tests passed successfully!");
  } catch (error) {
    console.error("\n❌ Test failed:", error);
    process.exit(1);
  } finally {
    if (tempUserId) {
      await prisma.user.delete({ where: { id: tempUserId } });
      console.log(`🧹 Cleaned up test user`);
    }
    await prisma.$disconnect();
  }
}

runTests();
