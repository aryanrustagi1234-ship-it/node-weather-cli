const https = require("https");

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(
      url,
      {
        headers: {
          "User-Agent": "node-weather-cli",
          Accept: "application/json",
        },
      },
      (res) => {
        let data = "";

        res.on("data", (chunk) => (data += chunk));

        res.on("end", () => {
          if (res.statusCode < 200 || res.statusCode >= 300) {
            return reject(
              new Error(
                `HTTP ${res.statusCode} from API. Body: ${data.slice(0, 200)}`
              )
            );
          }

          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Invalid JSON. Body: ${data.slice(0, 200)}`));
          }
        });
      }
    ).on("error", (e) => reject(e));
  });
}

async function getWeather(city) {
  try {
    const geoURL = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1`;

    const geoData = await fetchJSON(geoURL);

    if (!geoData.results || geoData.results.length === 0) {
      console.error("❌ City not found. Try another name.");
      return;
    }

    const { latitude, longitude, name, country } = geoData.results[0];

    const weatherURL = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    const weatherData = await fetchJSON(weatherURL);

    if (!weatherData.current_weather) {
      console.error("❌ Weather data not available right now.");
      return;
    }

    const w = weatherData.current_weather;

    console.log(`🌤 Weather in ${name}, ${country}: ${w.temperature}°C`);
    console.log(`💨 Wind: ${w.windspeed} km/h`);
  } catch (err) {
    console.error("❌ Failed to fetch weather data.");
    console.error("Full error:", err);
    if (err?.message) console.error("Reason:", err.message);
  }
}

module.exports = { getWeather };
