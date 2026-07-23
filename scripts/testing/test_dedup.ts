
const allCandidatesUnfiltered = [
  { name: "Chahal Shah", profile_url: "" },
  { name: "Chahal Shah", profile_url: "" },
  { name: "Chahal Shah", profile_url: "" },
];

const allCandidates = [];
const seenNames = new Set<string>();
const seenUrls = new Set<string>();

for (const c of allCandidatesUnfiltered) {
  const normName = (c.name || "").toLowerCase().trim();
  const normUrl = (c.profile_url || "").toLowerCase().trim();
  
  if (seenNames.has(normName)) continue;
  if (normUrl && seenUrls.has(normUrl)) continue;
  
  seenNames.add(normName);
  if (normUrl) seenUrls.add(normUrl);
  
  allCandidates.push(c);
}

console.log(allCandidates.length);
