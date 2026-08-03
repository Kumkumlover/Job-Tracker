import { PrismaClient } from "@prisma/client";
import fetch from "node-fetch";

const prisma = new PrismaClient();

const BASE_URL = "http://localhost:3000";

async function runTests() {
  console.log("Starting Integration Tests...\n");

  // 1. Setup Test User
  const testUserEmail = "testuser_integration@example.com";
  let user = await prisma.user.findUnique({ where: { email: testUserEmail } });
  
  if (!user) {
    user = await prisma.user.create({
      data: {
        email: testUserEmail,
        name: "Test User",
        apiKey: "test_api_key_12345",
      }
    });
  }

  // Ensure they have an API key set for testing
  user = await prisma.user.update({
    where: { email: testUserEmail },
    data: { apiKey: "test_api_key_12345" }
  });

  console.log(`[+] Test user ready: ${user.email} (ID: ${user.id})`);

  // 2. Test Saving Settings (Bug 1 & 2)
  console.log("\n--- Testing Settings API ---");
  const settingsPayload = {
    // Some random fake keys, but we can also use real ones if provided in env
    serperKey: process.env.TEST_SERPER_KEY || "fake_serper_key",
    geminiKey: process.env.TEST_GEMINI_KEY || "fake_gemini_key",
  };

  const settingsRes = await fetch(`${BASE_URL}/api/settings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test_api_key_12345"
    },
    body: JSON.stringify(settingsPayload)
  });

  const settingsData = await settingsRes.json();
  if (settingsRes.ok) {
    console.log("[+] Settings saved successfully.");
  } else {
    console.error("[-] Settings save failed:", settingsData);
  }

  // Verify it actually saved to the user record
  const updatedUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (updatedUser?.serperKey === settingsPayload.serperKey) {
    console.log("[+] Settings confirmed saved in DB for correct user.");
  } else {
    console.error("[-] Settings NOT saved in DB for user! Bug 2 is still present.");
  }


  // 3. Test Verify Keys (Bug 3)
  console.log("\n--- Testing Verify Keys API ---");
  const verifyRes = await fetch(`${BASE_URL}/api/verify-keys`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test_api_key_12345"
    },
    body: JSON.stringify(settingsPayload)
  });

  const verifyData = await verifyRes.json();
  console.log("[i] Verify Keys Response:", verifyData);

  if (verifyRes.ok) {
    console.log("[+] Verify Keys endpoint responded successfully.");
  } else {
    console.error("[-] Verify Keys endpoint failed:", verifyData);
  }

  // 4. Test Search Pipeline (Bug 4)
  console.log("\n--- Testing Search Pipeline ---");
  console.log("[i] If you provided TEST_SERPER_KEY, this should return results.");
  
  const searchRes = await fetch(`${BASE_URL}/api/outreach`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": "test_api_key_12345"
    },
    body: JSON.stringify({
      action: "find-contacts",
      company: "LiveSwitch",
      jobTitle: "Product Manager"
    })
  });

  const searchData = await searchRes.json();
  if (searchRes.ok) {
    console.log(`[+] Search completed successfully. Found ${searchData.rankedCandidates?.length || 0} candidates.`);
    if (searchData.rankedCandidates?.length > 0) {
      console.log(`    Top candidate: ${searchData.rankedCandidates[0].name} (${searchData.rankedCandidates[0].current_title})`);
    } else {
      console.log("    (No candidates found. Ensure you provided a valid TEST_SERPER_KEY and TEST_GEMINI_KEY to test the full pipeline)");
    }
  } else {
    console.error("[-] Search pipeline failed:", searchData);
  }

  console.log("\nIntegration Tests Complete.");
  process.exit(0);
}

runTests().catch(e => {
  console.error("Test Error:", e);
  process.exit(1);
});
