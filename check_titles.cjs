const d = require('./braintrust/datasets/golden.json');
d.forEach((r, i) => {
  const titles = r.hiring_manager_hypothesis?.map(h => h.title) || [];
  console.log(`${i+1}. ${r.company} | ${r.role_title} | HM: ${JSON.stringify(titles)}`);
});
