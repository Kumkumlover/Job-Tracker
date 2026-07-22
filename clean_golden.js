const fs = require('fs');
const data = require('./braintrust/datasets/golden.json');

// Companies where "Founder" shouldn't be the hiring manager
const publicOrLarge = ["IDFC First bank", "Housing.com", "Paytm", "Paramount", "Shiprocket", "ET Markets", "The Economic Times"];

const updated = data.map(row => {
  if (publicOrLarge.includes(row.company)) {
    row.hiring_manager_hypothesis = row.hiring_manager_hypothesis.filter(h => h.title !== "Founder");
  }
  return row;
});

fs.writeFileSync('./braintrust/datasets/golden.json', JSON.stringify(updated, null, 2));
console.log("Cleaned golden dataset.");
