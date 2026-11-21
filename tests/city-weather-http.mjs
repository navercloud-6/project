// Run against a local test server. This suite does not read or mutate the DB.
import assert from 'node:assert/strict';
const base = process.env.TEST_BASE_URL || 'http://127.0.0.1:3100';

async function current(cityId) {
  const query =
    cityId === undefined ? '' : `?cityId=${encodeURIComponent(cityId)}`;
  const response = await fetch(`${base}/api/weather/current${query}`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  return response.json();
}

const defaultWeather = await current();
assert.equal(defaultWeather.cityId, '41110');
assert.equal(defaultWeather.cityName, '수원시');
for (const cityId of ['41110', '41390', '41820']) {
  const data = await current(cityId);
  assert.equal(data.cityId, cityId);
  assert.ok(Number.isFinite(data.current.temperature));
  assert.ok(
    ['sun', 'cloud-sun', 'cloud', 'rain', 'snow', 'wind'].includes(
      data.current.icon,
    ),
  );
  assert.ok(data.coordinates.lat >= 36.8 && data.coordinates.lat <= 38.4);
  assert.ok(data.coordinates.lng >= 126.3 && data.coordinates.lng <= 128);
  assert.ok(['live', 'demo'].includes(data.mode));
  if (process.env.EXPECT_LIVE_WEATHER === 'true')
    assert.equal(data.mode, 'live');
  assert.equal(Date.parse(data.expiresAt) - Date.parse(data.fetchedAt), 600000);
  const repeated = await Promise.all([current(cityId), current(cityId)]);
  assert.ok(repeated.every((item) => item.fetchedAt === data.fetchedAt));
  console.log(
    `${data.cityName}: ${data.mode}, ${data.current.temperature}°C, ${data.current.condition}, ${data.observedAt}`,
  );
}
for (const cityId of ['', '11110', '99999', '수원시']) {
  const response = await fetch(
    `${base}/api/weather/current?cityId=${encodeURIComponent(cityId)}`,
  );
  assert.equal(response.status, 400);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok((await response.json()).error);
}
for (const city of ['수원시', '시흥시', '가평군']) {
  const response = await fetch(
    `${base}/api/weather?region=${encodeURIComponent(city)}`,
  );
  assert.equal(response.status, 200);
  const forecast = await response.json();
  assert.equal(forecast.region, city);
  assert.equal(forecast.daily.length, 5);
  assert.ok(forecast.recommendedPlaceIds.length > 0);
  if (process.env.EXPECT_LIVE_WEATHER === 'true')
    assert.equal(forecast.mode, 'live');
}
const spec = await (await fetch(`${base}/api/openapi`)).json();
assert.ok(spec.paths['/api/weather/current']);
assert.ok(spec.components.schemas.CityWeatherResponse);
console.log(
  'PASS: city weather, default city, metadata, shared cache, invalid IDs, city forecasts, and OpenAPI.',
);
