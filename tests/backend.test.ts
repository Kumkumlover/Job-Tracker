import { NextRequest } from "next/server";
import { GET as getSettings, POST as postSettings } from "../src/app/api/settings/route";
import { GET as getCustomProps, POST as postCustomProps } from "../src/app/api/custom-properties/route";
import { prisma } from "../src/lib/prisma";

// Mock the environment variable so we don't overwrite the real user's data
process.env.SMTP_USER = "test-backend-runner@example.com";

async function runTests() {
  console.log("🚀 Starting Backend API Integration Tests...\n");
  
  // 1. Setup
  const email = process.env.SMTP_USER;
  console.log(`[Setup] Isolating test environment to user: ${email}`);
  
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email, name: "Test Backend Runner" }});
  }
  
  // Set an API key so we can bypass NextAuth session checking
  const TEST_API_KEY = "test-backend-key-123";
  await prisma.user.update({
    where: { id: user.id },
    data: { apiKey: TEST_API_KEY }
  });
  
  // Cleanup any previous failed runs
  await prisma.profileContext.deleteMany({ where: { userId: user.id } });
  await prisma.customProperty.deleteMany({ where: { userId: user.id } });
  await prisma.customStage.deleteMany({ where: { userId: user.id } });

  try {
    // ---------------------------------------------------------
    // TEST 1: POST /api/settings -> Creates/Updates Profile in DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 1: Saving Profile Settings...");
    const postReq = new NextRequest("http://localhost/api/settings", {
      method: "POST",
      body: JSON.stringify({
        senderName: "Integration Test User",
        systemPrompt: "This is a rigorous backend test prompt."
      })
    });
    
    const postRes = await postSettings(postReq);
    if (!postRes.ok) throw new Error("POST /api/settings failed");
    console.log("✅ POST /api/settings succeeded.");

    // ---------------------------------------------------------
    // TEST 2: GET /api/settings -> Reads Profile from DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 2: Fetching Profile Settings...");
    const getReq = new NextRequest("http://localhost/api/settings", { method: "GET" });
    const getRes = await getSettings(getReq);
    const getData = await getRes.json();
    
    if (getData.profile.senderName !== "Integration Test User") {
      throw new Error(`Profile data mismatch. Expected "Integration Test User", got "${getData.profile.senderName}"`);
    }
    if (getData.profile.systemPrompt !== "This is a rigorous backend test prompt.") {
      throw new Error("Profile system prompt mismatch.");
    }
    console.log("✅ GET /api/settings retrieved exact data from Database.");

    // ---------------------------------------------------------
    // TEST 3: POST /api/custom-properties -> Writes to DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 3: Adding a Custom Property...");
    const postPropReq = new NextRequest("http://localhost/api/custom-properties", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify({ name: "Clearance Level", type: "text" })
    });
    const postPropRes = await postCustomProps(postPropReq);
    const newProp = await postPropRes.json();
    if (!newProp.id || newProp.name !== "Clearance Level") throw new Error("Failed to create Custom Property in DB");
    console.log(`✅ POST /api/custom-properties succeeded. Inserted ID: ${newProp.id}`);

    // ---------------------------------------------------------
    // TEST 4: GET /api/custom-properties -> Reads from DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 4: Fetching Custom Properties...");
    const getPropReq = new NextRequest("http://localhost/api/custom-properties", { 
      method: "GET",
      headers: { "x-api-key": TEST_API_KEY } 
    });
    const getPropRes = await getCustomProps(getPropReq);
    const propsList = await getPropRes.json();
    
    if (!Array.isArray(propsList) || !propsList.find(p => p.id === newProp.id)) {
      throw new Error("Custom Property was not persisted in the database.");
    }
    console.log("✅ GET /api/custom-properties retrieved data from Database.");

    // ---------------------------------------------------------
    // TEST 5: DELETE /api/custom-properties/[id] -> Deletes from DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 5: Deleting Custom Property...");
    const { DELETE: deleteCustomProps } = await import("../src/app/api/custom-properties/[id]/route");
    const deletePropReq = new NextRequest(`http://localhost/api/custom-properties/${newProp.id}`, {
      method: "DELETE",
      headers: { "x-api-key": TEST_API_KEY },
    });
    // In Next.js 15, params is a Promise
    const deletePropRes = await deleteCustomProps(deletePropReq, { params: Promise.resolve({ id: newProp.id }) });
    if (!deletePropRes.ok) throw new Error("DELETE /api/custom-properties/[id] failed");
    
    // Verify deletion
    const verifyGet = await getCustomProps(new NextRequest("http://localhost/api/custom-properties", { 
      method: "GET",
      headers: { "x-api-key": TEST_API_KEY }
    }));
    const verifyList = await verifyGet.json();
    if (verifyList.find((p: any) => p.id === newProp.id)) {
      throw new Error("Custom property was not actually deleted from DB!");
    }
    // ---------------------------------------------------------
    // TEST 6: POST /api/custom-stages -> Writes to DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 6: Adding a Custom Stage...");
    const { GET: getCustomStages, POST: postCustomStages } = await import("../src/app/api/custom-stages/route");
    const postStageReq = new NextRequest("http://localhost/api/custom-stages", {
      method: "POST",
      headers: { "x-api-key": TEST_API_KEY },
      body: JSON.stringify({ name: "Technical Interview", color: "#3b82f6" })
    });
    const postStageRes = await postCustomStages(postStageReq);
    const newStage = await postStageRes.json();
    if (!newStage.id || newStage.name !== "Technical Interview") throw new Error("Failed to create Custom Stage in DB");
    console.log(`✅ POST /api/custom-stages succeeded. Inserted ID: ${newStage.id}`);

    // ---------------------------------------------------------
    // TEST 7: GET /api/custom-stages -> Reads from DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 7: Fetching Custom Stages...");
    const getStageReq = new NextRequest("http://localhost/api/custom-stages", { 
      method: "GET",
      headers: { "x-api-key": TEST_API_KEY } 
    });
    const getStageRes = await getCustomStages(getStageReq);
    const stagesList = await getStageRes.json();
    
    if (!Array.isArray(stagesList) || !stagesList.find(s => s.id === newStage.id)) {
      throw new Error("Custom Stage was not persisted in the database.");
    }
    console.log("✅ GET /api/custom-stages retrieved data from Database.");

    // ---------------------------------------------------------
    // TEST 8: DELETE /api/custom-stages/[id] -> Deletes from DB
    // ---------------------------------------------------------
    console.log("⏳ TEST 8: Deleting Custom Stage...");
    const { DELETE: deleteCustomStage } = await import("../src/app/api/custom-stages/[id]/route");
    const deleteStageReq = new NextRequest(`http://localhost/api/custom-stages/${newStage.id}`, {
      method: "DELETE",
      headers: { "x-api-key": TEST_API_KEY },
    });
    const deleteStageRes = await deleteCustomStage(deleteStageReq, { params: Promise.resolve({ id: newStage.id }) });
    if (!deleteStageRes.ok) throw new Error("DELETE /api/custom-stages/[id] failed");
    
    // Verify deletion
    const verifyStageGet = await getCustomStages(new NextRequest("http://localhost/api/custom-stages", { 
      method: "GET",
      headers: { "x-api-key": TEST_API_KEY }
    }));
    const verifyStageList = await verifyStageGet.json();
    if (verifyStageList.find((s: any) => s.id === newStage.id)) {
      throw new Error("Custom stage was not actually deleted from DB!");
    }
    console.log("✅ DELETE /api/custom-stages successfully removed record from Database.");

    console.log("\n🎉 All Backend Integration Tests Passed! Database logic is sound.");

  } catch (error) {
    console.error("\n❌ TEST FAILED:");
    console.error(error);
  } finally {
    // Teardown
    console.log("\n[Teardown] Cleaning up test user and database records...");
    user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      await prisma.profileContext.deleteMany({ where: { userId: user.id } });
      await prisma.customProperty.deleteMany({ where: { userId: user.id } });
      await prisma.customStage.deleteMany({ where: { userId: user.id } });
      await prisma.user.delete({ where: { id: user.id } });
    }
    console.log("✨ Cleanup complete.");
    process.exit(0);
  }
}

runTests();
