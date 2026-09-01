(async () => {
  for (const path of ['/api/account/ping', '/api/account/profile']) {
    const method = path === '/api/account/profile' ? 'PUT' : 'GET';
    const response = await fetch(`http://localhost:5000${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
      },
      body: method === 'PUT' ? '{}' : undefined,
    });
    const text = await response.text();
    console.log(path, 'STATUS', response.status);
    console.log(text);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
