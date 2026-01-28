const { getWeather } = require("./weather");

const city = process.argv.slice(2).join(" ");

if (!city) {
  console.error("❌ Please provide a city name.");
  console.log('Example: node index.js "New York"');
  process.exit(1);
}

getWeather(city);
