import { NextResponse } from 'next/server';

export const runtime = 'edge';

// GET /api/weather - Fetch real weather or fallback to mock weather
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');
  
  const apiKey = process.env.OPENWEATHERMAP_API_KEY;

  if (apiKey && lat && lng) {
    try {
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`
      );
      if (response.ok) {
        const data = await response.json();
        return NextResponse.json(data);
      }
    } catch (err) {
      console.error('Weather API fetch failed, falling back to mock weather:', err);
    }
  }

  // Realistic mock weather fallback
  const mockWeather = {
    list: Array.from({ length: 5 }, (_, i) => {
      const weatherConditions = ['Clear', 'Clouds', 'Rain', 'Clouds', 'Clear'];
      const temps = [28, 25, 23, 26, 29];
      return {
        dt: Date.now() + i * 24 * 60 * 60 * 1000,
        main: { temp: temps[i], humidity: 65 },
        weather: [{ main: weatherConditions[i], description: weatherConditions[i] === 'Rain' ? 'light rain' : 'scattered clouds' }]
      };
    })
  };

  return NextResponse.json(mockWeather);
}

