const fs = require('fs');

const originalPath = 'C:/Users/Lenovo/Downloads/n8n-data-20260510T162446Z-3-001/n8n-data/Opening Details.txt';
const newJDsPath = 'C:/Users/Lenovo/Downloads/Job tacker-20260510T160312Z-3-001/Job tacker/web/new_jds.txt';

const newContent = fs.readFileSync(newJDsPath, 'utf8');
fs.appendFileSync(originalPath, '\n' + newContent);

console.log('Successfully appended new JDs.');
