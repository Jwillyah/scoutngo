(() => {
  const real = window.fetch.bind(window)
  /*
   * No /api/generate stub: Suggest is arithmetic now (src/core/suggest.ts) and
   * calls no endpoint. It reads buildings and water from Overpass directly.
   */
  window.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : (input?.url ?? String(input))
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
