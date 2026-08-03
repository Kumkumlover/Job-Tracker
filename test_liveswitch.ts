import { config } from "dotenv";
config({ path: ".env.local" });
import { searchCandidatesAuto } from "./src/lib/pipeline/search.js";
import { rankCandidates } from "./src/lib/pipeline/rank.js";

const JD = `About the job
Early-career: 1-3 years of experience.

Compensation isn’t determined by the salary band in the job posting. It’s determined by the value you bring. We pay top-of-market compensation to top-of-market talent.

Who we are

LiveSwitch builds video and communication technology for small businesses: virtual estimates, on-site documentation, and AI built for the trades. We help David slay Goliath. Our products help small businesses save money, make money, and serve their customers better.
The company is owned and led by Brian Hamilton, who has built major companies before. The model here is simple: hire exceptionally smart, driven people, give them real ownership from day one, and move fast. We are growing our product team in Bangalore, and this role offers real ownership of products that paying customers use every day.

What a PM is here

Not what you've read on LinkedIn. At LiveSwitch, the foundation of product management is knowing the product and the customer better than anyone else in the building. The way you get there is by testing the product harder and better than anyone else. You will use our products the way customers use them, every day, until you feel what they feel. You will find what's broken before customers do. You will watch real customers use our software and turn what you see into improvements that ship in days, not quarters.

Strategy comes later, and it comes from this: the person with the best data makes the decision, and you will have the best data because you did the work.

Read this before you apply

We recruit the way we'd want to be recruited: everything on the table, first date.
The hours are long. 60+ hour weeks are normal here. There is a cost to building something big. If you want balance right now, that's a legitimate choice, and this is the wrong job for it.
Your first months are in the product, not in decks. Testing, watching customers, finding and driving fixes. If that sounds beneath a PM to you, we disagree about what a PM is, and you shouldn't apply.
Deadlines are assumed to be now. No status meetings, no long threads. You get an objective, you own it, you move.
Feedback is direct. We are brutal about facts, so we can be fast about fixes. You'll get plain-spoken feedback and you're expected to give it, including to leadership. Arguing with leaders using better data is how you earn stature here.
Everything is measured. Bugs found, focus groups run, improvements shipped. You'll have clear numbers that are visible.
Titles mean nothing. Respect is earned by what you do.
If that list made you tired, please don't apply, sincerely and with respect. If it made you lean forward, keep reading.

What you'll do

Test our products the way customers use them, daily, and own the quality of what ships.
Run customer focus groups: watch real users, see where they get caught, find out why.
Turn findings into shipped improvements: you drive fixes and features end-to-end with engineering.
Own measurable goals and report against them like an owner.
Work directly with the software owner and senior leaders of the company from week one.

Who you are

1-3 years of experience where you shipped or materially improved something real.
A finder. In past work, you caught what others missed (bugs, broken flows, wrong numbers) because not finding it bothered you. You'll be asked for specific stories.
Top of your class from a top-tier school, with a record to show it.
You come with answers. Given a problem, you return a position and a reason, not a framework and four options.
You write and speak with clarity, and you say "I don't know" when you don't.

The process

Fast: measured in days, not months.
Screen with a member of the Product team (45 min).
Work sample: We give you access to a LiveSwitch product. You test it hard for 48 hours and bring us your ranked findings and top improvements, then defend them live.
Conversation with Brian Hamilton, owner of LiveSwitch. Yes, really, and yes, early. He meets candidates himself.
Deep dive with one of our senior product managers.
Offer, with a written, explicit summary of exactly what you're signing up for. No surprises. That's the whole point.`;

async function main() {
  console.log("=== TRACE START ===");
  console.log("1. Input Company: LiveSwitch, Job Title: Product Manager");
  
  const { results: rawResults, jdContacts, deptKeywords, companyContext } = await searchCandidatesAuto("LiveSwitch", "Product Manager", JD, []);
  
  console.log("\n2. JD Extraction:");
  console.log(JSON.stringify(jdContacts, null, 2));
  
  console.log(`\n3. Raw Search Results Found: ${rawResults.length}`);
  console.log(`Dept Keywords: ${deptKeywords}`);
  console.log(`Company Context: ${companyContext}`);
  
  const ranked = rawResults.length 
    ? await rankCandidates(rawResults, "LiveSwitch", "Product Manager", JD, [], deptKeywords, companyContext)
    : [];
    
  console.log("\n4. LLM Ranked Candidates:");
  console.log(JSON.stringify(ranked, null, 2));
  console.log("=== TRACE END ===");
}

main().catch(console.error);
