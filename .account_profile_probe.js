(async () => {
  const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIyIiwicm9sZSI6ImN1c3RvbWVyIiwiZW1haWwiOiJodW5nLnBoYW5AYm9hcmRnYW1lLnZuIiwiaWF0IjoxNzg1NjEyNTc4LCJleHAiOjE3ODYyMTczNzh9.zZZZinrUT87Ct_KiRZCYNM6eNVG9SiBGoa9KC1sCnnA';
  const response = await fetch('http://localhost:5000/api/account/profile', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      fullName: 'Phan Thanh Hung',
      email: 'hung.phan@boardgame.vn',
      phone: '0901000002',
      avatar: '',
    }),
  });
  const text = await response.text();
  console.log('STATUS', response.status);
  console.log(text);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
