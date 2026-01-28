const https = require("https");
const dns = require("dns").promises;

/**
 * Diagnostic function to check network connectivity
 */
async function checkNetworkConnectivity() {
  console.log("🔍 Running network diagnostics...");
  
  try {
    // Test DNS resolution
    const geoResolved = await dns.resolve("geocoding-api.open-meteo.com");
    const weatherResolved = await dns.resolve("api.open-meteo.com");
    
    console.log("✅ DNS resolution successful:");
    console.log(`   geocoding-api.open-meteo.com → ${geoResolved.join(", ")}`);
    console.log(`   api.open-meteo.com → ${weatherResolved.join(", ")}`);
    
    return true;
  } catch (dnsError) {
    console.error("❌ DNS resolution failed:", dnsError.message);
    return false;
  }
}

/**
 * Fetches JSON data from a URL with retry logic
 */
function fetchJSON(url, retries = 3, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const attempt = (retryCount) => {
      const req = https.get(
        url,
        {
          headers: {
            "User-Agent": "node-weather-cli/1.0",
            Accept: "application/json",
          },
          timeout: timeout,
        },
        (res) => {
          let data = "";

          res.on("data", (chunk) => (data += chunk));

          res.on("end", () => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return reject(
                new Error(`HTTP ${res.statusCode}: ${data.slice(0, 100)}`)
              );
            }

            try {
              resolve(JSON.parse(data));
            } catch {
              reject(new Error(`Invalid JSON: ${data.slice(0, 100)}`));
            }
          });
        }
      );

      req.on("error", (e) => {
        if (retryCount > 0 && (e.code === 'ETIMEDOUT' || e.code === 'ECONNRESET')) {
          console.log(`⚠️  Request failed, ${retryCount} retries left...`);
          setTimeout(() => attempt(retryCount - 1), 1000 * (4 - retryCount)); // Exponential backoff
        } else {
          reject(e);
        }
      });

      req.on("timeout", () => {
        req.destroy();
        if (retryCount > 0) {
          console.log(`⚠️  Timeout, ${retryCount} retries left...`);
          setTimeout(() => attempt(retryCount - 1), 1000);
        } else {
          reject(new Error("Request timeout after retries"));
        }
      });
    };

    attempt(retries);
  });
}

/**
 * Alternative weather API provider as fallback
 */
async function getWeatherFromAlternativeProvider(city) {
  console.log("🔄 Trying alternative weather provider...");
  
  // Using WeatherAPI.com (requires free API key from https://www.weatherapi.com/)
  // You can get a free API key by signing up
  const apiKey = process.env.WEATHER_API_KEY || "YOUR_API_KEY_HERE";
  
  if (apiKey === "YOUR_API_KEY_HERE") {
    console.log("ℹ️  To use alternative provider, get a free API key from https://www.weatherapi.com/");
    console.log("ℹ️  Then set it as: export WEATHER_API_KEY=your_key_here");
    return null;
  }
  
  try {
    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${encodeURIComponent(city)}&aqi=no`;
    
    const response = await fetch(url, { timeout: 10000 });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    console.log(`\n📍 ${data.location.name}, ${data.location.country}`);
    console.log(`🌡  Temperature: ${data.current.temp_c}°C`);
    console.log(`💨 Wind: ${data.current.wind_kph} km/h`);
    console.log(`💧 Humidity: ${data.current.humidity}%`);
    console.log(`☁️  Conditions: ${data.current.condition.text}`);
    
    return data;
  } catch (error) {
    console.error("Alternative provider also failed:", error.message);
    return null;
  }
}

/**
 * Main weather function with better error handling
 */
async function getWeather(city, useFallback = true) {
  console.log(`🌤  Fetching weather for: ${city}`);
  
  // Check network first
  const networkOk = await checkNetworkConnectivity();
  if (!networkOk) {
    console.error("❌ Network diagnostics failed. Please check your internet connection.");
    console.log("💡 Troubleshooting tips:");
    console.log("   1. Check if you're connected to the internet");
    console.log("   2. Try: ping api.open-meteo.com");
    console.log("   3. Check firewall settings");
    console.log("   4. Try using a different network (mobile hotspot)");
    
    if (useFallback) {
      return await getWeatherFromAlternativeProvider(city);
    }
    return null;
  }
  
  try {
    const geoURL = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      city
    )}&count=1`;

    console.log("📡 Fetching location data...");
    const geoData = await fetchJSON(geoURL);

    if (!geoData.results || geoData.results.length === 0) {
      console.error("❌ City not found. Try another name.");
      return null;
    }

    const { latitude, longitude, name, country } = geoData.results[0];
    console.log(`📍 Located: ${name}, ${country} (${latitude}, ${longitude})`);

    const weatherURL = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`;

    console.log("📡 Fetching weather data...");
    const weatherData = await fetchJSON(weatherURL);

    if (!weatherData.current_weather) {
      console.error("❌ Weather data not available.");
      return null;
    }

    const w = weatherData.current_weather;

    console.log(`\n🌤 Weather in ${name}, ${country}:`);
    console.log(`🌡  Temperature: ${w.temperature}°C`);
    console.log(`💨 Wind: ${w.windspeed} km/h`);
    console.log(`🧭 Wind Direction: ${w.winddirection}°`);
    console.log(`✅ Data source: Open-Meteo`);

    return {
      location: { name, country, latitude, longitude },
      weather: w,
      timestamp: new Date().toISOString()
    };

  } catch (err) {
    console.error("\n❌ Failed to fetch weather data from Open-Meteo.");
    console.error(`   Error: ${err.message}`);
    
    if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED') {
      console.log("\n💡 The Open-Meteo API might be temporarily unavailable.");
      console.log("   This could be due to:");
      console.log("   • API service maintenance");
      console.log("   • Network restrictions in your region");
      console.log("   • Firewall blocking the connection");
      
      if (useFallback) {
        console.log("\n🔄 Attempting to use alternative provider...");
        return await getWeatherFromAlternativeProvider(city);
      }
    }
    
    return null;
  }
}

// Simple test function
async function testConnection() {
  console.log("🧪 Testing API connectivity...");
  
  try {
    // Test with a small, simple request
    const testURL = "https://api.open-meteo.com/v1/status";
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    const response = await fetch(testURL, { 
      signal: controller.signal,
      headers: { "User-Agent": "node-weather-cli-test" }
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      console.log("✅ Open-Meteo API is reachable");
      return true;
    } else {
      console.log(`⚠️  API returned status: ${response.status}`);
      return false;
    }
  } catch (error) {
    console.error(`❌ Cannot reach Open-Meteo API: ${error.message}`);
    return false;
  }
}

// CLI interface
async function main() {
  const city = process.argv[2];
  
  if (!city) {
    console.log("Usage: node index.js <city>");
    console.log("Example: node index.js Delhi");
    console.log("\nOptions:");
    console.log("  --test    Test API connectivity");
    console.log("  --help    Show this help");
    return;
  }
  
  if (city === "--test") {
    await testConnection();
    return;
  }
  
  if (city === "--help") {
    console.log("Weather CLI - Get current weather for any city");
    console.log("\nCommands:");
    console.log("  node index.js <city>    Get weather for specified city");
    console.log("  node index.js --test    Test API connectivity");
    console.log("  node index.js --help    Show this help");
    console.log("\nExamples:");
    console.log("  node index.js Delhi");
    console.log("  node index.js \"New York\"");
    console.log("  node index.js London");
    return;
  }
  
  await getWeather(city);
}

// Export for use as module
module.exports = { 
  getWeather, 
  fetchJSON, 
  testConnection,
  checkNetworkConnectivity 
};

// Run if called directly
if (require.main === module) {
  main();
}