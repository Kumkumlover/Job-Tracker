import { config } from "dotenv";
config({ path: ".env.local" });

async function runQuery(q: string, page: number = 1) {
  const res = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: { "X-API-KEY": process.env.SERPER_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ q, num: 10, page }),
  });
  const data = await res.json();
  console.log(`Page ${page} results: ${data.organic?.length || 0}`);
  if (data.organic) {
    data.organic.forEach((o: any) => console.log(`${o.title}\n${o.snippet}\n`));
  }
}

async function main() {
  const q = `site:linkedin.com/in "GIVA" ("Associate Product Manager" OR "Head of Product" OR "Product Manager")`;
  await runQuery(q, 1);
  await runQuery(q, 2);
}
main();
