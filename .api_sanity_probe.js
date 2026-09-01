(async () => {
  for (const path of ['/api/health', '/api/account/profile']) {
    const response = await fetch(`http://localhost:5000${path}`, {
      method: path === '/api/account/profile' ? 'PUT' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer test',
      },
      body: path === '/api/account/profile' ? '{}' : undefined,
    }).catch((error) => ({ error }));

    if (response.error) {
      console.log(path, 'ERROR', response.error.message);
      continue;
    }

    const text = await response.text();
    console.log(path, 'STATUS', response.status);
    console.log(text);
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
