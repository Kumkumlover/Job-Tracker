import { config } from "dotenv";
config({ path: ".env.local" });

async function testGen() {
  const reqBody = {
    action: "generate-email",
    recipientName: "Aman Sanghavi",
    company: "Presolv360",
    jobTitle: "Product Intern",
    jd: "Passion for building products, analytics, problem-solving."
  };

  const res = await fetch("http://localhost:3000/api/outreach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(reqBody)
  });

  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

testGen().catch(console.error);
