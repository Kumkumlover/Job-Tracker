import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

async function test() {
  const apiKey = process.env.SERPER_API_KEY;
  console.log("Key:", apiKey?.substring(0,5));
  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': apiKey || '', 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: 'site:jobs.lever.co "Engineer"', num: 10 })
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

test().catch(console.error);
