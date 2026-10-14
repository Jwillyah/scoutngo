(() => {
  const real = window.fetch.bind(window)
  const PLAN = { positions: [
    { x: 0.32, y: 0.44, lensId: 'sony-200-600', focalLength: 400,
      shot: 'Boats coming off the dock with the bridge behind them.',
      angleRationale: 'Low bank puts the hulls against open water, not parked cars.',
      risk: 'Bank is soft below the rip-rap. Check footing before committing.' },
    { x: 0.61, y: 0.38, lensId: 'sigma-28-75', focalLength: 35,
      shot: 'Wide of the whole basin as the fleet turns in.',
      angleRationale: 'Only vantage that holds both piers in one frame.', risk: '' },
    { x: 0.5, y: 0.62, lensId: 'air-3s-wide', focalLength: 24, platform: 'air', altitudeFeet: 180,
      shot: 'Top down of the wake pattern across the channel.',
      angleRationale: 'Pattern only reads from directly above.',
      risk: 'Crosses the public pier. Keep the line over water.' },
  ] }
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
    if (url.includes('/api/generate')) {
      try { window.__sentImage = JSON.parse(init.body).image } catch {}
      return new Response(JSON.stringify({ status: 'ok', raw: JSON.stringify(PLAN) }), { headers: { 'content-type': 'application/json' } })
    }
    if (url.includes('/api/streetview')) {
      const c = document.createElement('canvas'); c.width = 640; c.height = 400
      const g = c.getContext('2d')
      const sky = g.createLinearGradient(0, 0, 0, 220)
      sky.addColorStop(0, '#6ea8d8'); sky.addColorStop(1, '#cfe2ef')
      g.fillStyle = sky; g.fillRect(0, 0, 640, 220)
      g.fillStyle = '#3d5a6c'; g.fillRect(0, 220, 640, 60)
      g.fillStyle = '#5b6b5a'; g.fillRect(0, 280, 640, 120)
      g.fillStyle = '#2a3a30'
      for (let i = 0; i < 7; i++) g.fillRect(40 + i * 90, 190, 14, 40)
      return new Response(JSON.stringify({ status: 'ok', image: c.toDataURL('image/jpeg', 0.8), date: '2019-08' }), { headers: { 'content-type': 'application/json' } })
    }
    return real(input, init)
  }
})()
